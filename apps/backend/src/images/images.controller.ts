import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../database/prisma.service';

/**
 * Upload de imagem persistido no banco (UploadedImage). Os bytes vão pro Postgres
 * (não pro disco), então o upload é permanente independente do servidor.
 * - POST /api/admin/images  → guarda e devolve { id, url: "/api/images/:id" }
 * - GET  /api/images/:id    → serve a imagem (público, cache imutável)
 */
@Controller()
export class ImagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('admin/images')
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
      fileFilter: (_req, file, cb) => {
        if (/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Formato inválido. Use PNG, JPG, WEBP, GIF ou AVIF.'), false);
        }
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Envie um arquivo no campo "file".');
    const img = await this.prisma.uploadedImage.create({
      data: { mimeType: file.mimetype, data: file.buffer, sizeBytes: file.size },
      select: { id: true },
    });
    return { id: img.id, url: `/api/images/${img.id}` };
  }

  @Get('images/:id')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const img = await this.prisma.uploadedImage.findUnique({ where: { id } });
    if (!img) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', img.mimeType);
    // Imutável: cada upload gera um id novo, então o browser pode cachear pra sempre.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(img.data));
  }
}
