import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // Extrae el token del header "Authorization: Bearer <token>"
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'MI_LLAVE_SECRETA_SUPER_SEGURA', // Debe ser la misma que en AuthModule
    });
  }

  async validate(payload: any) {
    // Lo que retornes aquí se guardará en request.user
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}