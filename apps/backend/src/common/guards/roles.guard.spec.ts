import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function createContext(user: { role?: UserRole } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(createContext({ role: UserRole.USER }))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('allows when user role matches', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN, UserRole.OPERATOR]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(createContext({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('denies when user role does not match', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(createContext({ role: UserRole.USER }))).toBe(false);
  });

  it('denies when user is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(createContext(undefined))).toBe(false);
  });
});
