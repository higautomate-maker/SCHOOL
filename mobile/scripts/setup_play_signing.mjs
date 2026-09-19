// One-time local upload credential generation. Never overwrites existing keys.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apps = ['staff_admin_app', 'student_parent_app', 'driver_gps_app'];
const keytool = process.env.HIG_KEYTOOL || '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool';
const configs = apps.map(app => path.join(repo, 'mobile', app, 'android/key.properties'));
process.umask(0o077);
// lstat catches dangling symlinks as well as existing files.
const exists = file => { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
fs.accessSync(keytool, fs.constants.X_OK);
for (const config of configs) {
  if (exists(config)) throw new Error('Signing configuration already exists. Refusing to replace credentials.');
  execFileSync('git', ['check-ignore', '--quiet', config], { cwd: repo });
}
const release = path.join(repo, 'release');
if (!exists(release)) fs.mkdirSync(release, { mode: 0o700 });
const stat = fs.lstatSync(release);
if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Release path must be a real directory.');
const secureDir = fs.mkdtempSync(path.join(release, 'play-upload-keys-'));
fs.chmodSync(secureDir, 0o700);
execFileSync('git', ['check-ignore', '--quiet', secureDir], { cwd: repo });
console.log(`SIGNING_BACKUP_DIRECTORY=${secureDir}`);

for (let i = 0; i < apps.length; i++) {
  const app = apps[i];
  const password = randomBytes(32).toString('hex');
  const keystore = path.join(secureDir, `${app}.jks`);
  const env = { ...process.env, HIG_UPLOAD_PASSWORD: password };
  try {
    execFileSync(keytool, ['-genkeypair', '-noprompt', '-keystore', keystore,
      '-storetype', 'PKCS12', '-alias', 'hig-upload', '-keyalg', 'RSA',
      '-keysize', '2048', '-validity', '10000',
      '-dname', 'CN=HIG Android Upload, O=HIG AUTOMATION INDIA PRIVATE LIMITED',
      '-storepass:env', 'HIG_UPLOAD_PASSWORD', '-keypass:env', 'HIG_UPLOAD_PASSWORD'],
      { env, stdio: 'ignore' });
    fs.chmodSync(keystore, 0o600);
    execFileSync(keytool, ['-list', '-keystore', keystore, '-alias', 'hig-upload',
      '-storepass:env', 'HIG_UPLOAD_PASSWORD'], { env, stdio: 'ignore' });
  } catch {
    throw new Error(`Key generation/verification failed for ${app}. Preserve ${secureDir} and inspect before retrying.`);
  }
  const properties = `storeFile=${keystore}\nstorePassword=${password}\nkeyAlias=hig-upload\nkeyPassword=${password}\n`;
  fs.writeFileSync(path.join(secureDir, `${app}-key.properties`), properties, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(configs[i], properties, { flag: 'wx', mode: 0o600 });
  console.log(`${app}: upload key generated and verified; configuration permission 600`);
}
console.log('Keep an encrypted off-machine backup of the signing directory. Do not share it or commit it.');
