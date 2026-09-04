import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { CursorPaginationQueryDto } from '../shared/dto/cursor-pagination-query.dto';
import type { Paginated } from '../shared/pagination/cursor';
import { CreatePostDto } from './dto/create-post.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { PostsService, type PostView } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    return this.posts.search(query.q, query.limit);
  }

  @Get()
  list(@Query() query: CursorPaginationQueryDto): Promise<Paginated<PostView>> {
    return this.posts.list(query.limit, query.cursor);
  }

  @Post()
  @Roles(Role.NATURAL, Role.JURIDICA)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user.sub, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
    });
  }

  @Get(':id')
  async get(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PostView> {
    const post = await this.posts.getForViewer(user.sub, id);
    if (!post) {
      throw new NotFoundException('Not found');
    }
    return post;
  }

  @Patch(':id')
  @Roles(Role.NATURAL, Role.JURIDICA)
  async update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePostDto,
  ): Promise<PostView> {
    const post = await this.posts.updateOwn(user.sub, id, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
    });
    if (!post) {
      throw new NotFoundException('Not found');
    }
    return post;
  }

  @Delete(':id')
  @Roles(Role.NATURAL, Role.JURIDICA)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const deleted = await this.posts.deleteOwn(user.sub, id);
    if (!deleted) {
      throw new NotFoundException('Not found');
    }
  }
}
