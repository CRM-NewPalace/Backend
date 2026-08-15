import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import { IMAGE_MAX_BYTES } from './media.constants';

const SHARP_FORMATS = new Set(['jpeg', 'png', 'webp']);

export type UploadedMedia = {
  url: string;
  publicId: string;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  async uploadImage(params: {
    buffer: Buffer;
    mimetype: string;
    folder: string;
    maxWidth: number;
    maxHeight: number;
  }): Promise<UploadedMedia> {
    this.ensureConfigured();
    if (params.buffer.length > IMAGE_MAX_BYTES) {
      throw new BadRequestException('A imagem deve ter no máximo 5 MB.');
    }

    let processed: Buffer;
    try {
      const meta = await sharp(params.buffer, {
        failOn: 'none',
        animated: false,
      }).metadata();
      const format = meta.format;
      if (!format || !SHARP_FORMATS.has(format)) {
        throw new BadRequestException('Envie uma imagem JPG, PNG ou WebP.');
      }
      processed = await sharp(params.buffer, {
        failOn: 'none',
        animated: false,
      })
        .rotate()
        .resize(params.maxWidth, params.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(
        `Imagem rejeitada (${params.mimetype}): ${this.errorMessage(error)}`,
      );
      throw new BadRequestException('Arquivo de imagem inválido.');
    }

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: params.folder,
            resource_type: 'image',
            unique_filename: true,
            overwrite: false,
          },
          (error, uploaded) => {
            if (error || !uploaded) {
              reject(error ?? new Error('Falha no upload da imagem.'));
              return;
            }
            resolve(uploaded);
          },
        );
        stream.end(processed);
      });

      const url = result.secure_url?.trim();
      const publicId = result.public_id?.trim();
      if (!url || !publicId) {
        throw new ServiceUnavailableException(
          'O Cloudinary não retornou a URL da imagem.',
        );
      }
      return { url, publicId };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Falha no upload Cloudinary: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível enviar a imagem. Confira CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no Render.',
      );
    }
  }

  async destroy(publicId: string | null | undefined): Promise<void> {
    const id = publicId?.trim();
    if (!id) return;
    try {
      this.ensureConfigured();
      await cloudinary.uploader.destroy(id, { resource_type: 'image' });
    } catch (error) {
      this.logger.warn(
        `Não foi possível remover a imagem ${id} no Cloudinary: ${this.errorMessage(error)}`,
      );
    }
  }

  async destroyMany(publicIds: Array<string | null | undefined>): Promise<void> {
    await Promise.all(publicIds.map((id) => this.destroy(id)));
  }

  folder(tenantId: string, kind: 'empreendimentos' | 'construtoras', id: string) {
    return `crm/${tenantId}/${kind}/${id}`;
  }

  requireFile(file?: Express.Multer.File): Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie uma imagem JPG, PNG ou WebP.');
    }
    return file;
  }

  private ensureConfigured() {
    if (this.configured) return;
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Upload de imagens não está configurado. No Render, defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.',
      );
    }
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.configured = true;
  }

  private errorMessage(error: unknown): string {
    if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>;
      const message = rec.message ?? rec.error;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
    return error instanceof Error ? error.message : 'erro desconhecido';
  }
}
