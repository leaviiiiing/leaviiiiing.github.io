/**
 * 加密数据结构
 * 用于存储加密后的文章内容
 */
export interface EncryptedData {
  /** Base64 编码的加密内容 */
  ciphertext: string;
  /** Base64 编码的初始化向量 */
  iv: string;
  /** Base64 编码的盐值 */
  salt: string;
  /** 加密算法标识 */
  algorithm: "AES-GCM";
  /** 密钥派生迭代次数 */
  iterations: number;
}

/**
 * 加密文章数据
 * 包含文章内容和目录的加密数据
 */
export interface EncryptedPostData {
  /** 文章 HTML 内容的加密数据 */
  content: EncryptedData;
  /** TOC 目录数据的加密数据（可选） */
  toc?: EncryptedData;
}

/**
 * TOC 目录项
 */
export interface TocItem {
  id: string;
  text: string;
  level: number;
}

/**
 * 解密结果
 */
export interface DecryptResult {
  /** 解密后的 HTML 内容 */
  content: string;
  /** 解密后的 TOC 目录（可选） */
  toc?: TocItem[];
}

/**
 * 密码验证结果
 */
export interface PasswordVerifyResult {
  success: boolean;
  error?: string;
}

/**
 * 加密配置
 */
export interface EncryptionConfig {
  /** 密钥派生迭代次数，默认 100000 */
  iterations?: number;
  /** 盐值长度（字节），默认 16 */
  saltLength?: number;
  /** 初始化向量长度（字节），默认 12 (GCM 推荐值) */
  ivLength?: number;
}

/**
 * 默认加密配置
 */
export const DEFAULT_ENCRYPTION_CONFIG: Required<EncryptionConfig> = {
  iterations: 100000,
  saltLength: 16,
  ivLength: 12,
};
