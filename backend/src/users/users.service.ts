import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { User } from './entities/user.entity';

export interface PublicUser {
  id: string;
  username: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async requireById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username })
      .getOne();
  }

  async search(search: string | undefined, currentUserId: string): Promise<PublicUser[]> {
    const where = search
      ? { id: Not(currentUserId), username: ILike(`%${search}%`) }
      : { id: Not(currentUserId) };
    const users = await this.usersRepository.find({
      where,
      select: { id: true, username: true },
      order: { username: 'ASC' },
      take: 20,
    });
    return users.map(({ id, username }) => ({ id, username }));
  }
}
