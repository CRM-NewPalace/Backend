import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'A senha é obrigatória.' })
  // bcrypt trunca em 72 bytes; limitar aqui evita hash de payload gigante (DoS).
  @MaxLength(72)
  password!: string;
}
