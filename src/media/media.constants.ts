import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function imageUploadInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_MIMES.includes(file.mimetype as (typeof IMAGE_MIMES)[number])) {
        cb(
          new BadRequestException('Envie uma imagem JPG, PNG ou WebP.'),
          false,
        );
        return;
      }
      cb(null, true);
    },
  });
}
