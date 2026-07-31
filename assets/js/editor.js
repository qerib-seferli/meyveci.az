// ============================================================
// REDAKTOR İCAZƏ SİSTEMİ
// Redaktor rolunu və admin tərəfindən verilən icazələri oxuyur.
// ============================================================

import {
  profile,
} from './core.js';

let editorProfileCache = undefined;

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

  if (!permissions) {
    return false;
  }

  return permissions[permissionName] === true;
}

export function clearEditorCache() {
  editorProfileCache = undefined;
}
