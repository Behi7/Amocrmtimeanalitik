import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
@Injectable()
export class CryptoService {
  private key: Buffer;
  constructor(private config: ConfigService) {
    const k = this.config.get<string>('TOKEN_ENCRYPTION_KEY')!;
    if (Buffer.byteLength(k) !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes');
    this.key = Buffer.from(k);
  }
  encrypt(plain: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({ version: 1, nonce: nonce.toString('base64'), ciphertext: enc.toString('base64'), authTag: tag.toString('base64') });
  }
  decrypt(data: string): string {
    const obj = JSON.parse(data);
    const nonce = Buffer.from(obj.nonce, 'base64');
    const ct = Buffer.from(obj.ciphertext, 'base64');
    const tag = Buffer.from(obj.authTag, 'base64');
    const dec = createDecipheriv('aes-256-gcm', this.key, nonce);
    dec.setAuthTag(tag);
    return dec.update(ct).toString('utf8') + dec.final('utf8');
  }
}
