import { supabase } from './supabase.js';
export { supabase };
export const $=(s,r=document)=>r.querySelector(s); export const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const cache={session:undefined,profile:undefined};
export const PLACEHOLDER='./assets/img/placeholders/product-placeholder.png';
export function money(n){return `${Number(n||0).toFixed(2)} AZN`}
export function toast(msg){let t=$('#toast'); if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
export function byId(){return new URLSearchParams(location.search).get('id')}
export async function session(force=false){if(cache.session!==undefined&&!force)return cache.session; const {data}=await supabase.auth.getSession(); cache.session=data.session||null; return cache.session}
export async function user(){const s=await session(); return s?.user||null}
export async function profile(force=false){if(cache.profile!==undefined&&!force)return cache.profile; const u=await user(); if(!u){cache.profile=null;return null} const {data,error}=await supabase.from('profiles').select('id,email,first_name,last_name,phone,bio,avatar_url,role,is_active').eq('id',u.id).maybeSingle(); if(error){console.warn(error); cache.profile=null; return null} cache.profile=data; sessionStorage.setItem('mc_role',data?.role||'user'); return data}
export async function requireAuth(){const u=await user(); if(!u){location.href='./login.html'; return null} return u}
export async function requireRole(role){const p=await profile(true); if(!p||p.role!==role){toast('Bu bölməyə giriş icazəniz yoxdur'); setTimeout(()=>location.href='../index.html',900); return null} return p}
export async function logout(){await supabase.auth.signOut(); sessionStorage.clear(); location.href='./login.html'}
export function setLoading(on=false){const el=$('#loader'); if(el) el.style.display=on?'grid':'none'}
export function statusAz(s){return ({pending:'Gözləyir',confirmed:'Təsdiqləndi',preparing:'Hazırlanır',on_the_way:'Yoldadır',delivered:'Çatdırıldı',cancelled:'Ləğv edildi',paid:'Ödənildi',rejected:'Rədd edildi',approved:'Təsdiqləndi'})[s]||s||'—'}
export function pagePath(path){const base=location.pathname.includes('/admin/')||location.pathname.includes('/courier/')?'../':'./';return base+path}
export function slugify(v){return String(v||'').toLowerCase().replaceAll('ə','e').replaceAll('ö','o').replaceAll('ü','u').replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ş','s').replaceAll('ç','c').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
export function formData(form){return Object.fromEntries(new FormData(form).entries())}
export async function uploadFile(bucket,file,pathPrefix='uploads'){if(!file||!file.name)return null; const ext=file.name.split('.').pop(); const path=`${pathPrefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`; const {error}=await supabase.storage.from(bucket).upload(path,file,{upsert:true}); if(error) throw error; return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl}
