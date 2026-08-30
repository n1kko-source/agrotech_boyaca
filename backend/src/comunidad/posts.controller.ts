import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    return this.posts.search(query.q, query.limit);
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
}
