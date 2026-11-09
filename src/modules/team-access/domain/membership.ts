import { Entity } from '../../../shared/domain/entity';
import type { Role } from './roles';

export interface MembershipProps {
  id: string;
  userId: string;
  merchantId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export class Membership extends Entity {
  private constructor(private props: MembershipProps) {
    super(props.id);
  }

  static create(props: Omit<MembershipProps, 'updatedAt'>): Membership {
    return new Membership({ ...props, updatedAt: props.createdAt });
  }

  static rehydrate(props: MembershipProps): Membership {
    return new Membership({ ...props });
  }

  get userId(): string {
    return this.props.userId;
  }
  get merchantId(): string {
    return this.props.merchantId;
  }
  get role(): Role {
    return this.props.role;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  changeRole(role: Role, now: Date): void {
    this.props.role = role;
    this.props.updatedAt = now;
  }

  toProps(): MembershipProps {
    return { ...this.props };
  }
}
