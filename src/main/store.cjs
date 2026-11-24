// Armazenamento local cifrado (AES-256-GCM, chave derivada da palavra-passe com scrypt).
// A palavra-passe nunca é guardada; sem ela os dados não podem ser recuperados.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KDF = { N: 2 ** 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 };

function deriveKey(password, salt, params = KDF) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password).normalize('NFC'), salt, 32, params, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function encrypt(key, salt, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return JSON.stringify({
    app: 'bussola-mgf',
    v: 1,
    kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  });
}

async function decryptText(text, password) {
  let env;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error('O ficheiro não é um ficheiro de dados da Bússola MGF.');
  }
  if (env.app !== 'bussola-mgf' || !env.ct) throw new Error('O ficheiro não é um ficheiro de dados da Bússola MGF.');
  const salt = Buffer.from(env.salt, 'base64');
  const params = { N: env.kdf.N, r: env.kdf.r, p: env.kdf.p, maxmem: KDF.maxmem };
  const key = await deriveKey(password, salt, params);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64')), decipher.final()]);
    return { data: JSON.parse(pt.toString('utf8')), key, salt };
  } catch {
    throw new Error('Palavra-passe incorreta.');
  }
}

function atomicWrite(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'dados.bmgf');
    this.key = null;
    this.salt = null;
    this.backedUp = false;
  }

  exists() {
    return fs.existsSync(this.file);
  }

  get unlocked() {
    return !!this.key;
  }

  async create(password, data) {
    if (this.exists()) throw new Error('Já existem dados guardados neste computador.');
    fs.mkdirSync(this.dir, { recursive: true });
    this.salt = crypto.randomBytes(16);
    this.key = await deriveKey(password, this.salt);
    atomicWrite(this.file, encrypt(this.key, this.salt, data));
  }

  async unlock(password) {
    const { data, key, salt } = await decryptText(fs.readFileSync(this.file, 'utf8'), password);
    this.key = key;
    this.salt = salt;
    return data;
  }

  save(data) {
    if (!this.key) throw new Error('Os dados estão bloqueados.');
    if (!this.backedUp && this.exists()) {
      fs.copyFileSync(this.file, this.file + '.bak');
      this.backedUp = true;
    }
    atomicWrite(this.file, encrypt(this.key, this.salt, data));
  }

  lock() {
    if (this.key) this.key.fill(0);
    this.key = null;
    this.salt = null;
  }

  async changePassword(oldPassword, newPassword, data) {
    await decryptText(fs.readFileSync(this.file, 'utf8'), oldPassword);
    this.salt = crypto.randomBytes(16);
    this.key = await deriveKey(newPassword, this.salt);
    atomicWrite(this.file, encrypt(this.key, this.salt, data));
  }

  /** Cópia de segurança: o ficheiro já está cifrado, basta copiá-lo. */
  exportTo(target) {
    fs.copyFileSync(this.file, target);
  }

  async readBackup(source, password) {
    const { data } = await decryptText(fs.readFileSync(source, 'utf8'), password);
    return data;
  }

  wipe() {
    this.lock();
    for (const f of [this.file, this.file + '.bak', this.file + '.tmp']) if (fs.existsSync(f)) fs.rmSync(f);
  }
}

module.exports = { Store, deriveKey, encrypt, decryptText };
