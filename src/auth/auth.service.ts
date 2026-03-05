import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(email: string, pass: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) throw new UnauthorizedException('Credenciales incorrectas');

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  // Método para crear el primer admin (puedes llamarlo desde un endpoint temporal)
  async createFirstAdmin(email: string, pass: string) {
    const hashedPassword = await bcrypt.hash(pass, 10);
    const user = this.userRepo.create({
      email,
      password: hashedPassword,
      role: 'USER' as any
    });
    return await this.userRepo.save(user);
  }

  async findAllUsers() {
    return await this.userRepo.find({
      select: ['id', 'email', 'role'], // No devolvemos la contraseña
      order: { id: 'ASC' }
    });
  }

  // Cambiar el rol
  async changeUserRole(adminId: number, userId: number, newRole: string) {
    // 1. Evitar que se modifique a sí mismo
    if (adminId === Number(userId)) {
      throw new BadRequestException('No puedes cambiar tu propio rol. Solicita a otro administrador que lo haga.');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException(`El usuario con ID ${userId} no existe`);
    }

    // 2. Aplicar el cambio
    user.role = newRole as any;
    await this.userRepo.save(user);

    return { 
      success: true, 
      message: `El usuario ${user.email} ahora tiene el rol: ${newRole}` 
    };
  }
}