import { describe, expect, it } from 'vitest';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import {
  EvaluationPerList,
  EvaluationRoleList,
  EvaluationRolePerMap,
  EvaluationDefaultRoleVal,
  EvaluationReadPermissionVal,
  EvaluationWritePermissionVal,
  EvaluationManagePermissionVal
} from '@fastgpt/global/support/permission/evaluation/constant';
import {
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';

describe('EvaluationPermission Controller', () => {
  describe('Constructor', () => {
    it('should create instance with default role when no props provided', () => {
      const permission = new EvaluationPermission();

      expect(permission.role).toBe(EvaluationDefaultRoleVal);
      expect(permission.roleList).toBe(EvaluationRoleList);
      expect(permission.rolePerMap).toBe(EvaluationRolePerMap);
      expect(permission.perList).toBe(EvaluationPerList);
    });

    it('should create instance with default role when props provided without role', () => {
      const permission = new EvaluationPermission({});

      expect(permission.role).toBe(EvaluationDefaultRoleVal);
    });

    it('should create instance with specified role', () => {
      const permission = new EvaluationPermission({
        role: ReadRoleVal
      });

      expect(permission.role).toBe(ReadRoleVal);
    });

    it('should create instance with owner status', () => {
      const permission = new EvaluationPermission({
        isOwner: true
      });

      expect(permission.role).toBe(OwnerRoleVal);
      expect(permission.isOwner).toBe(true);
    });

    it('should create instance with both role and owner status', () => {
      const permission = new EvaluationPermission({
        role: WriteRoleVal,
        isOwner: true
      });

      expect(permission.role).toBe(OwnerRoleVal); // Owner should override role
      expect(permission.isOwner).toBe(true);
    });
  });

  describe('Permission Checking', () => {
    it('should check read permission correctly', () => {
      const readPermission = new EvaluationPermission({
        role: ReadRoleVal
      });

      expect(readPermission.checkPer(EvaluationReadPermissionVal)).toBe(true);
      expect(readPermission.checkPer(EvaluationWritePermissionVal)).toBe(false);
      expect(readPermission.checkPer(EvaluationManagePermissionVal)).toBe(false);
    });

    it('should check write permission correctly', () => {
      const writePermission = new EvaluationPermission({
        role: WriteRoleVal
      });

      expect(writePermission.checkPer(EvaluationReadPermissionVal)).toBe(true);
      expect(writePermission.checkPer(EvaluationWritePermissionVal)).toBe(true);
      expect(writePermission.checkPer(EvaluationManagePermissionVal)).toBe(false);
    });

    it('should check manage permission correctly', () => {
      const managePermission = new EvaluationPermission({
        role: ManageRoleVal
      });

      expect(managePermission.checkPer(EvaluationReadPermissionVal)).toBe(true);
      expect(managePermission.checkPer(EvaluationWritePermissionVal)).toBe(true);
      expect(managePermission.checkPer(EvaluationManagePermissionVal)).toBe(true);
    });

    it('should check owner permission correctly', () => {
      const ownerPermission = new EvaluationPermission({
        isOwner: true
      });

      expect(ownerPermission.checkPer(EvaluationReadPermissionVal)).toBe(true);
      expect(ownerPermission.checkPer(EvaluationWritePermissionVal)).toBe(true);
      expect(ownerPermission.checkPer(EvaluationManagePermissionVal)).toBe(true);
    });

    it('should deny all permissions for default role', () => {
      const defaultPermission = new EvaluationPermission();

      expect(defaultPermission.checkPer(EvaluationReadPermissionVal)).toBe(false);
      expect(defaultPermission.checkPer(EvaluationWritePermissionVal)).toBe(false);
      expect(defaultPermission.checkPer(EvaluationManagePermissionVal)).toBe(false);
    });
  });

  describe('Role and Permission Values', () => {
    it('should have correct role values', () => {
      expect(ReadRoleVal).toBe(0b100);
      expect(WriteRoleVal).toBe(0b010);
      expect(ManageRoleVal).toBe(0b001);
    });

    it('should have correct permission values', () => {
      expect(EvaluationReadPermissionVal).toBe(0b100);
      expect(EvaluationWritePermissionVal).toBe(0b010);
      expect(EvaluationManagePermissionVal).toBe(0b001);
    });

    it('should have correct default role value', () => {
      expect(EvaluationDefaultRoleVal).toBe(0);
    });
  });

  describe('Permission Hierarchy', () => {
    it('should maintain correct permission hierarchy', () => {
      // Read permission only allows read
      const readPerm = new EvaluationPermission({ role: ReadRoleVal });
      expect(readPerm.hasReadPer).toBe(true);
      expect(readPerm.hasWritePer).toBe(false);
      expect(readPerm.hasManagePer).toBe(false);

      // Write permission allows read and write
      const writePerm = new EvaluationPermission({ role: WriteRoleVal });
      expect(writePerm.hasReadPer).toBe(true);
      expect(writePerm.hasWritePer).toBe(true);
      expect(writePerm.hasManagePer).toBe(false);

      // Manage permission allows read, write and manage
      const managePerm = new EvaluationPermission({ role: ManageRoleVal });
      expect(managePerm.hasReadPer).toBe(true);
      expect(managePerm.hasWritePer).toBe(true);
      expect(managePerm.hasManagePer).toBe(true);

      // Owner has all permissions
      const ownerPerm = new EvaluationPermission({ isOwner: true });
      expect(ownerPerm.hasReadPer).toBe(true);
      expect(ownerPerm.hasWritePer).toBe(true);
      expect(ownerPerm.hasManagePer).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid role values', () => {
      // Test with a role value that doesn't exist in the role map
      // Using a value that has no matching permissions (0 but not default)
      const permission = new EvaluationPermission({
        role: 0b1000 // Invalid role that doesn't map to any permissions
      });

      // For invalid roles that don't map to permissions in the role map,
      // the permission should still be calculated correctly based on the role value
      // This tests the robustness of the permission system
      expect(permission.role).toBe(0b1000);
    });

    it('should handle zero permission values', () => {
      const permission = new EvaluationPermission({
        role: ReadRoleVal
      });

      expect(permission.checkPer(0)).toBe(true); // Zero permission should always pass
    });

    it('should handle negative permission values', () => {
      const permission = new EvaluationPermission({
        role: ReadRoleVal
      });

      // Negative permissions should be handled gracefully
      expect(permission.checkPer(-1)).toBe(false);
    });
  });

  describe('Constants Consistency', () => {
    it('should use common permission list values', () => {
      expect(EvaluationPerList.read).toBe(0b100);
      expect(EvaluationPerList.write).toBe(0b010);
      expect(EvaluationPerList.manage).toBe(0b001);
    });

    it('should use common role list values', () => {
      expect(EvaluationRoleList.read.value).toBe(0b100);
      expect(EvaluationRoleList.write.value).toBe(0b010);
      expect(EvaluationRoleList.manage.value).toBe(0b001);
    });

    it('should have consistent role-permission mapping', () => {
      // Read role should map to read permission
      expect(EvaluationRolePerMap.get(ReadRoleVal)).toBe(EvaluationPerList.read);

      // Write role should map to read + write permissions
      expect(EvaluationRolePerMap.get(WriteRoleVal)).toBe(
        EvaluationPerList.read | EvaluationPerList.write
      );

      // Manage role should map to read + write + manage permissions
      expect(EvaluationRolePerMap.get(ManageRoleVal)).toBe(
        EvaluationPerList.read | EvaluationPerList.write | EvaluationPerList.manage
      );
    });
  });
});
