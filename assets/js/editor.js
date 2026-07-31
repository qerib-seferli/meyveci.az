// ============================================================
// REDAKTOR SİSTEMİ
// Rol və icazələri yoxlayır, məhsul şəklini 4:3 formatında
// hazırlayır və Supabase Storage-a yükləyir.
// ============================================================

import {
  supabase,
  profile,
  toast,
} from './core.js';

let editorProfileCache;
let activeImageEditorContext = null;

/* ============================================================
   REDAKTOR PROFİLİ VƏ İCAZƏLƏR
   ============================================================ */

export async function getEditorProfile(force = false) {
  if (editorProfileCache !== undefined && !force) {
    return editorProfileCache;
  }

  const activeProfile = await profile(force);

  if (
    !activeProfile ||
    activeProfile.role !== 'editor' ||
    activeProfile.is_active === false
  ) {
    editorProfileCache = null;
    return null;
  }

  editorProfileCache = activeProfile;

  return activeProfile;
}

export async function getEditorPermissions(force = false) {
  const activeProfile = await getEditorProfile(force);

  if (!activeProfile) {
    return null;
  }

  return {
    canEditProductImage:
      activeProfile.editor_can_edit_product_image === true,

    canEditProductName:
      activeProfile.editor_can_edit_product_name === true,

    canEditProductDescription:
      activeProfile.editor_can_edit_product_description === true,

    canEditBanner:
      activeProfile.editor_can_edit_banner === true,

    canEditNews:
      activeProfile.editor_can_edit_news === true,
  };
}

export function isEditor(profileData) {
  return Boolean(
    profileData &&
    profileData.role === 'editor' &&
    profileData.is_active !== false
  );
}

export async function canEditor(permissionName, force = false) {
  const permissions = await getEditorPermissions(force);

  return permissions?.[permissionName] === true;
}

export function clearEditorCache() {
  editorProfileCache = undefined;
}

/* ============================================================
   ŞƏKLİN 4:3 FORMATINA SALINMASI
   ============================================================ */

async function compressProductImage4x3(file, maxSizeKB = 90) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Yalnız şəkil faylı seçilə bilər'));
      return;
    }

    const reader = new FileReader();
    const image = new Image();

    reader.onload = (event) => {
      image.src = event.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Şəkil faylı oxunmadı'));
    };

    image.onerror = () => {
      reject(new Error('Şəkil açıla bilmədi'));
    };

    image.onload = async () => {
      try {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;

        if (!sourceWidth || !sourceHeight) {
          throw new Error('Şəklin ölçüsü müəyyən edilmədi');
        }

        const targetRatio = 4 / 3;
        const sourceRatio = sourceWidth / sourceHeight;

        let cropWidth = sourceWidth;
        let cropHeight = sourceHeight;
        let cropX = 0;
        let cropY = 0;

        if (sourceRatio > targetRatio) {
          // Şəkil həddindən artıq enlidir — sağ və soldan kəsilir.
          cropWidth = Math.round(sourceHeight * targetRatio);
          cropX = Math.round((sourceWidth - cropWidth) / 2);
        } else if (sourceRatio < targetRatio) {
          // Şəkil həddindən artıq uzundur — yuxarı və aşağıdan kəsilir.
          cropHeight = Math.round(sourceWidth / targetRatio);
          cropY = Math.round((sourceHeight - cropHeight) / 2);
        }

        // Şəkil böyüdülmür. Maksimum 1200 × 900 saxlanılır.
        let outputWidth = Math.min(cropWidth, 1200);
        let outputHeight = Math.round(outputWidth * 3 / 4);

        if (outputHeight > cropHeight) {
          outputHeight = cropHeight;
          outputWidth = Math.round(outputHeight * 4 / 3);
        }

        outputWidth = Math.max(4, Math.round(outputWidth));
        outputHeight = Math.max(3, Math.round(outputHeight));

        const canvas = document.createElement('canvas');

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const context = canvas.getContext('2d', {
          alpha: false,
        });

        if (!context) {
          throw new Error('Şəkil emal sistemi açıla bilmədi');
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        // Şəffaf PNG şəkillərdə fon ağ qalır.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, outputWidth, outputHeight);

        context.drawImage(
          image,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          outputWidth,
          outputHeight
        );

        let quality = 0.86;
        let blob = null;

        do {
          blob = await new Promise((blobResolve) => {
            canvas.toBlob(
              blobResolve,
              'image/webp',
              quality
            );
          });

          if (!blob) break;

          if (blob.size / 1024 <= maxSizeKB) break;

          quality -= 0.06;
        } while (quality >= 0.28);

        if (!blob) {
          throw new Error('Şəkil WebP formatına çevrilmədi');
        }

        const safeBaseName = String(file.name || 'product-image')
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9-_]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'product-image';

        resolve(
          new File(
            [blob],
            `${safeBaseName}.webp`,
            {
              type: 'image/webp',
              lastModified: Date.now(),
            }
          )
        );
      } catch (error) {
        reject(error);
      }
    };

    reader.readAsDataURL(file);
  });
}

/* ============================================================
   STORAGE-A YÜKLƏMƏ
   Hər məhsul üçün eyni fayl yolu istifadə olunur.
   Buna görə köhnə şəkil ayrıca yığılıb qalmır.
   ============================================================ */

async function uploadEditorProductImage(productId, file) {
  const filePath = `editor-products/${productId}.webp`;

  const { error: uploadError } = await supabase.storage
    .from('products')
    .upload(
      filePath,
      file,
      {
        upsert: true,
        contentType: 'image/webp',
        cacheControl: '0',
      }
    );

  if (uploadError) {
    throw uploadError;
  }

  const publicUrl = supabase.storage
    .from('products')
    .getPublicUrl(filePath)
    .data
    .publicUrl;

  if (!publicUrl) {
    throw new Error('Yeni şəkil linki alınmadı');
  }

  // Brauzerin köhnə şəkli keşdən göstərməməsi üçün versiya əlavə olunur.
  return `${publicUrl}?v=${Date.now()}`;
}

/* ============================================================
   MƏHSUL ŞƏKLİNİN BAZADA YENİLƏNMƏSİ
   ============================================================ */

async function saveEditorProductImage(productId, imageUrl) {
  const { data, error } = await supabase.rpc(
    'editor_update_product_image',
    {
      p_product_id: productId,
      p_image_url: imageUrl,
    }
  );

  if (error) {
    throw error;
  }

  if (data !== true) {
    throw new Error('Məhsul şəkli yenilənmədi');
  }
}

/* ============================================================
   SƏHİFƏDƏKİ EYNİ MƏHSUL ŞƏKİLLƏRİNİN YENİLƏNMƏSİ
   ============================================================ */

function updateProductImagesOnPage(productId, imageUrl) {
  document
    .querySelectorAll('[data-product-image-id]')
    .forEach((image) => {
      if (image.dataset.productImageId === productId) {
        image.src = imageUrl;
      }
    });

  document
    .querySelectorAll('.editor-product-image-btn')
    .forEach((button) => {
      if (button.dataset.id === productId) {
        button.dataset.currentImage = imageUrl;
      }
    });
}

/* ============================================================
   REDAKTOR MODALI
   ============================================================ */

function ensureProductImageEditorModal() {
  let modal = document.querySelector('#editorProductImageModal');

  if (modal) {
    return modal;
  }

  modal = document.createElement('div');

  modal.id = 'editorProductImageModal';
  modal.className = 'editor-image-modal';

  modal.innerHTML = `
    <div class="editor-image-modal-card">
      <div class="editor-image-modal-head">
        <div>
          <b>Məhsul şəklini dəyiş</b>
          <small id="editorImageProductName">Məhsul</small>
        </div>

        <button
          id="closeEditorImageModal"
          class="editor-image-modal-close"
          type="button"
          aria-label="Bağla"
        >
          ×
        </button>
      </div>

      <div class="editor-image-preview-wrap">
        <img
          id="editorImagePreview"
          src=""
          alt="Məhsul şəkli"
        >
      </div>

      <p class="editor-image-help">
        Şəkil avtomatik 4:3 formatına salınacaq, WebP ediləcək və
        ölçüsü kiçildiləcək.
      </p>

      <div class="editor-image-actions">
        <button
          id="editorOpenCamera"
          class="btn btn-primary"
          type="button"
        >
          📷 Kamera ilə çək
        </button>

        <button
          id="editorOpenGallery"
          class="btn btn-soft"
          type="button"
        >
          🖼️ Qalereyadan seç
        </button>
      </div>

      <input
        id="editorCameraInput"
        type="file"
        accept="image/*"
        capture="environment"
        hidden
      >

      <input
        id="editorGalleryInput"
        type="file"
        accept="image/*"
        hidden
      >

      <div
        id="editorImageProgress"
        class="editor-image-progress"
        hidden
      >
        ⏳ Şəkil hazırlanır...
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.classList.remove('show');
    activeImageEditorContext = null;

    const cameraInput = modal.querySelector('#editorCameraInput');
    const galleryInput = modal.querySelector('#editorGalleryInput');

    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
  };

  modal
    .querySelector('#closeEditorImageModal')
    ?.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  modal
    .querySelector('#editorOpenCamera')
    ?.addEventListener('click', () => {
      modal.querySelector('#editorCameraInput')?.click();
    });

  modal
    .querySelector('#editorOpenGallery')
    ?.addEventListener('click', () => {
      modal.querySelector('#editorGalleryInput')?.click();
    });

  const handleSelectedFile = async (file) => {
    if (!file || !activeImageEditorContext) return;

    const {
      productId,
      onUpdated,
    } = activeImageEditorContext;

    const progress = modal.querySelector('#editorImageProgress');
    const cameraButton = modal.querySelector('#editorOpenCamera');
    const galleryButton = modal.querySelector('#editorOpenGallery');
    const closeButton = modal.querySelector('#closeEditorImageModal');

    try {
      if (progress) {
        progress.hidden = false;
        progress.textContent = '⏳ Şəkil 4:3 formatında hazırlanır...';
      }

      if (cameraButton) cameraButton.disabled = true;
      if (galleryButton) galleryButton.disabled = true;
      if (closeButton) closeButton.disabled = true;

      const compressedFile = await compressProductImage4x3(
        file,
        90
      );

      if (progress) {
        progress.textContent = '⏳ Yeni şəkil yüklənir...';
      }

      const imageUrl = await uploadEditorProductImage(
        productId,
        compressedFile
      );

      if (progress) {
        progress.textContent = '⏳ Məhsul məlumatı yenilənir...';
      }

      await saveEditorProductImage(
        productId,
        imageUrl
      );

      updateProductImagesOnPage(
        productId,
        imageUrl
      );

      if (typeof onUpdated === 'function') {
        onUpdated(imageUrl);
      }

      toast('Məhsul şəkli uğurla yeniləndi');

      modal.classList.remove('show');
      activeImageEditorContext = null;
    } catch (error) {
      console.error('Redaktor şəkil xətası:', error);

      toast(
        error?.message ||
        'Məhsul şəkli yenilənmədi'
      );
    } finally {
      if (progress) {
        progress.hidden = true;
        progress.textContent = '⏳ Şəkil hazırlanır...';
      }

      if (cameraButton) cameraButton.disabled = false;
      if (galleryButton) galleryButton.disabled = false;
      if (closeButton) closeButton.disabled = false;

      const cameraInput = modal.querySelector('#editorCameraInput');
      const galleryInput = modal.querySelector('#editorGalleryInput');

      if (cameraInput) cameraInput.value = '';
      if (galleryInput) galleryInput.value = '';
    }
  };

  modal
    .querySelector('#editorCameraInput')
    ?.addEventListener('change', (event) => {
      handleSelectedFile(event.target.files?.[0]);
    });

  modal
    .querySelector('#editorGalleryInput')
    ?.addEventListener('change', (event) => {
      handleSelectedFile(event.target.files?.[0]);
    });

  return modal;
}

/* ============================================================
   MODALI AÇIR
   ============================================================ */

export async function openProductImageEditor(options = {}) {
  const allowed = await canEditor(
    'canEditProductImage'
  );

  if (!allowed) {
    toast('Məhsul şəklini dəyişmək icazəniz yoxdur');
    return;
  }

  const productId = String(options.productId || '');

  if (!productId) {
    toast('Məhsul məlumatı tapılmadı');
    return;
  }

  const modal = ensureProductImageEditorModal();

  activeImageEditorContext = {
    productId,
    productName:
      options.productName || 'Məhsul',
    currentImageUrl:
      options.currentImageUrl || '',
    onUpdated:
      options.onUpdated,
  };

  const title = modal.querySelector('#editorImageProductName');
  const preview = modal.querySelector('#editorImagePreview');

  if (title) {
    title.textContent =
      activeImageEditorContext.productName;
  }

  if (preview) {
    preview.src =
      activeImageEditorContext.currentImageUrl || '';
  }

  modal.classList.add('show');
}
