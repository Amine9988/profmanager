// هذا الملف يُضمّن داخل تطبيق Electron ويُرسل للزبون مع التطبيق.
// يحتاج: npm install node-machine-id
//
// ضع محتوى keys/public.pem الذي أنشأته بـ generate-keypair.js هنا تحت PUBLIC_KEY_PEM

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { machineIdSync } = require('node-machine-id');

const APP_NAME = 'profmanager'; // يجب أن يطابق القيمة الموجودة في tools/keygen.js

// الصق هنا محتوى keys/public.pem كاملاً (يمكن توزيعه بأمان، فهو ليس سرياً)
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAoK+ZidJn2LGUm1ovGbHhtZ7LlTHwR9MAZ1UJEZ+Ub8w=
-----END PUBLIC KEY-----`;

const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);

/**
 * يُرجع بصمة فريدة وثابتة لجهاز المستخدم الحالي.
 * هذه القيمة هي التي يجب أن يرسلها الزبون لك كي تولّد له الترخيص.
 */
function getHardwareId() {
  return machineIdSync(true); // true = نسخة hash آمنة، ثابتة عبر إعادة التشغيل
}

/**
 * يتحقق من صحة مفتاح الترخيص:
 *  1. التوقيع صحيح (أي صادر فعلاً منك أنت البائع)
 *  2. الـ hwid داخل المفتاح يطابق جهاز المستخدم الحالي فعلاً
 *  3. لم تنتهِ صلاحيته (إن وُجد تاريخ انتهاء)
 */
function verifyLicense(licenseKey) {
  try {
    const [payloadB64, sigB64] = licenseKey.trim().split('.');
    if (!payloadB64 || !sigB64) return { valid: false, reason: 'صيغة غير صحيحة' };

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const signature = Buffer.from(sigB64, 'base64url');

    const isSignatureValid = crypto.verify(
      null,
      Buffer.from(payloadJson),
      publicKey,
      signature
    );
    if (!isSignatureValid) return { valid: false, reason: 'توقيع غير صالح' };

    const payload = JSON.parse(payloadJson);

    if (payload.app !== APP_NAME) {
      return { valid: false, reason: 'الترخيص لتطبيق آخر' };
    }

    const currentHwid = getHardwareId();
    if (payload.hwid !== currentHwid) {
      return { valid: false, reason: 'الترخيص غير مخصص لهذا الجهاز' };
    }

    if (payload.exp) {
      const expDate = new Date(payload.exp);
      if (Date.now() > expDate.getTime()) {
        return { valid: false, reason: 'انتهت صلاحية الترخيص' };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'تعذر قراءة الترخيص' };
  }
}

/**
 * مسار ملف حفظ الترخيص محلياً بعد أول تفعيل ناجح
 */
function getLicenseFilePath(app) {
  return path.join(app.getPath('userData'), 'license.key');
}

function saveLicense(app, licenseKey) {
  fs.writeFileSync(getLicenseFilePath(app), licenseKey, 'utf8');
}

function loadSavedLicense(app) {
  const filePath = getLicenseFilePath(app);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * الدالة الرئيسية التي تستدعيها في main.js عند بدء التطبيق
 */
function checkLicenseOnStartup(app) {
  const saved = loadSavedLicense(app);
  if (!saved) return { valid: false, reason: 'لا يوجد ترخيص محفوظ' };
  return verifyLicense(saved);
}

module.exports = {
  getHardwareId,
  verifyLicense,
  saveLicense,
  loadSavedLicense,
  checkLicenseOnStartup,
};
