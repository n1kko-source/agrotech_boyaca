import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { skipCompression } from '../shared/compress/gzip-brotli.middleware';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import type { Paginated } from '../shared/pagination/cursor';
import { CreateGuiaDto } from './dto/create-guia.dto';
import { ListGuiasQueryDto } from './dto/list-guias-query.dto';
import { UpdateGuiaDto } from './dto/update-guia.dto';
import { GUIAS_AUDIO_MAX_BYTES, GUIAS_PDF_MAX_BYTES } from './guias.constants';
import {
  GuiasService,
  isReadable,
  type GuiaView,
  type UploadedGuiaFile,
} from './guias.service';

const UPLOAD_MAX = Math.max(GUIAS_PDF_MAX_BYTES, GUIAS_AUDIO_MAX_BYTES);

@Controller('guias')
export class GuiasController {
  constructor(private readonly guias: GuiasService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: UPLOAD_MAX } }),
  )
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateGuiaDto,
    @UploadedFile() file: UploadedGuiaFile | undefined,
  ): Promise<GuiaView> {
    return this.guias.create(user.sub, dto, file);
  }

  @Get()
  list(@Query() query: ListGuiasQueryDto): Promise<Paginated<GuiaView>> {
    return this.guias.list(query.limit, query.cursor, query.categoria);
  }

  @Get(':id/archivo')
  async archivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const stream = await this.guias.openArchivo(id, range);
    skipCompression(res);
    res.status(stream.status);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', stream.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (stream.contentRange) {
      res.setHeader('Content-Range', stream.contentRange);
    }
    if (stream.status === 416) {
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }
    res.setHeader('Content-Length', String(stream.contentLength));
    if (isReadable(stream.body)) {
      stream.body.pipe(res);
      return;
    }
    res.end(stream.body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GuiaView> {
    return this.guias.get(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuiaDto,
  ): Promise<GuiaView> {
    return this.guias.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.guias.remove(id);
  }
}
