import { Controller, Post, Body, Get, UseGuards, SetMetadata, Patch, Param, BadRequestException, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-admin-secret')
  async register(@Body() body: any) {
    // Este endpoint es temporal para crear tu primer acceso
    return this.authService.createFirstAdmin(body.email, body.password);
  }

  @Post('login')
  async login(@Body() body: any) {
    return this.authService.login(body.email, body.password);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @SetMetadata('roles', ['ADMIN'])
  async getAllUsers() {
    return this.authService.findAllUsers();
  }

  // 2. Cambiar rol de un usuario (Solo para ADMIN)
  @Patch('update-role/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @SetMetadata('roles', ['ADMIN'])
  async updateRole(
    @Param('id') id: number, 
    @Body() body: { role: string },
    @Req() req: any // Inyectamos el request para sacar el ID del admin actual
  ) {
    const adminId = req.user.sub; // 'sub' es el id que guardamos en el payload del JWT
    
    if (body.role !== 'ADMIN' && body.role !== 'USER') {
      throw new BadRequestException('El rol debe ser ADMIN o USER');
    }

    return this.authService.changeUserRole(adminId, id, body.role);
  }
}