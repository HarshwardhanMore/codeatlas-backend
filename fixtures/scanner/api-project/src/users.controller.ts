import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { Roles } from './roles.decorator';

class JwtGuard {}

export class CreateUserDto {
  email: string;
  name: string;
}

export interface UserDto {
  email: string;
  id: string;
  name: string;
}

@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  @Get(':id')
  getUser(@Param('id') id: string, @Query('include') include?: string): UserDto {
    return { email: include ?? '', id, name: 'User' };
  }

  @Post()
  @Roles('ADMIN')
  createUser(@Body() input: CreateUserDto): UserDto {
    return { email: input.email, id: 'id', name: input.name };
  }
}
