import { describe, expect, it } from 'vitest';
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
  CommonPerList,
  CommonRoleList,
  CommonRolePerMap,
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal,
  ReadPermissionVal,
  WritePermissionVal,
  ManagePermissionVal
} from '@fastgpt/global/support/permission/constant';

describe('Evaluation Permission Constants', () => {
  describe('Permission Lists', () => {
    it('should use common permission list', () => {
      expect(EvaluationPerList).toBe(CommonPerList);
      expect(EvaluationPerList.read).toBe(CommonPerList.read);
      expect(EvaluationPerList.write).toBe(CommonPerList.write);
      expect(EvaluationPerList.manage).toBe(CommonPerList.manage);
      expect(EvaluationPerList.owner).toBe(CommonPerList.owner);
    });

    it('should have correct permission values', () => {
      expect(EvaluationPerList.read).toBe(0b100);
      expect(EvaluationPerList.write).toBe(0b010);
      expect(EvaluationPerList.manage).toBe(0b001);
    });
  });

  describe('Role Lists', () => {
    it('should use common role list', () => {
      expect(EvaluationRoleList).toEqual(CommonRoleList);
      expect(EvaluationRoleList.read).toBe(CommonRoleList.read);
      expect(EvaluationRoleList.write).toBe(CommonRoleList.write);
      expect(EvaluationRoleList.manage).toBe(CommonRoleList.manage);
    });

    it('should have correct role values', () => {
      expect(EvaluationRoleList.read.value).toBe(0b100);
      expect(EvaluationRoleList.write.value).toBe(0b010);
      expect(EvaluationRoleList.manage.value).toBe(0b001);
    });

    it('should have correct role properties', () => {
      expect(EvaluationRoleList.read.checkBoxType).toBe('single');
      expect(EvaluationRoleList.write.checkBoxType).toBe('single');
      expect(EvaluationRoleList.manage.checkBoxType).toBe('single');
    });
  });

  describe('Role Permission Map', () => {
    it('should use common role permission map', () => {
      expect(EvaluationRolePerMap).toBe(CommonRolePerMap);
    });

    it('should map read role to read permission', () => {
      const readPermission = EvaluationRolePerMap.get(ReadRoleVal);
      expect(readPermission).toBe(ReadPermissionVal);
    });

    it('should map write role to read + write permissions', () => {
      const writePermission = EvaluationRolePerMap.get(WriteRoleVal);
      expect(writePermission).toBe(ReadPermissionVal | WritePermissionVal);
    });

    it('should map manage role to read + write + manage permissions', () => {
      const managePermission = EvaluationRolePerMap.get(ManageRoleVal);
      expect(managePermission).toBe(ReadPermissionVal | WritePermissionVal | ManagePermissionVal);
    });
  });

  describe('Default Values', () => {
    it('should have correct default role value', () => {
      expect(EvaluationDefaultRoleVal).toBe(0);
    });
  });

  describe('Exported Permission Values', () => {
    it('should export correct read permission value', () => {
      expect(EvaluationReadPermissionVal).toBe(EvaluationPerList.read);
      expect(EvaluationReadPermissionVal).toBe(0b100);
    });

    it('should export correct write permission value', () => {
      expect(EvaluationWritePermissionVal).toBe(EvaluationPerList.write);
      expect(EvaluationWritePermissionVal).toBe(0b010);
    });

    it('should export correct manage permission value', () => {
      expect(EvaluationManagePermissionVal).toBe(EvaluationPerList.manage);
      expect(EvaluationManagePermissionVal).toBe(0b001);
    });
  });

  describe('Constants Consistency', () => {
    it('should be consistent with common constants', () => {
      expect(EvaluationReadPermissionVal).toBe(ReadPermissionVal);
      expect(EvaluationWritePermissionVal).toBe(WritePermissionVal);
      expect(EvaluationManagePermissionVal).toBe(ManagePermissionVal);
    });

    it('should maintain bitwise relationships', () => {
      // Each permission should be a unique bit
      expect(EvaluationReadPermissionVal & EvaluationWritePermissionVal).toBe(0);
      expect(EvaluationReadPermissionVal & EvaluationManagePermissionVal).toBe(0);
      expect(EvaluationWritePermissionVal & EvaluationManagePermissionVal).toBe(0);

      // Combined permissions should contain individual permissions
      const writeRolePermission = EvaluationRolePerMap.get(WriteRoleVal);
      expect(writeRolePermission).toBeDefined();
      expect(writeRolePermission! & EvaluationReadPermissionVal).toBe(EvaluationReadPermissionVal);
      expect(writeRolePermission! & EvaluationWritePermissionVal).toBe(
        EvaluationWritePermissionVal
      );

      const manageRolePermission = EvaluationRolePerMap.get(ManageRoleVal);
      expect(manageRolePermission).toBeDefined();
      expect(manageRolePermission! & EvaluationReadPermissionVal).toBe(EvaluationReadPermissionVal);
      expect(manageRolePermission! & EvaluationWritePermissionVal).toBe(
        EvaluationWritePermissionVal
      );
      expect(manageRolePermission! & EvaluationManagePermissionVal).toBe(
        EvaluationManagePermissionVal
      );
    });
  });

  describe('Type Safety', () => {
    it('should have the correct types', () => {
      expect(typeof EvaluationDefaultRoleVal).toBe('number');
      expect(typeof EvaluationReadPermissionVal).toBe('number');
      expect(typeof EvaluationWritePermissionVal).toBe('number');
      expect(typeof EvaluationManagePermissionVal).toBe('number');

      expect(EvaluationPerList).toBeDefined();
      expect(EvaluationRoleList).toBeDefined();
      expect(EvaluationRolePerMap).toBeInstanceOf(Map);
    });

    it('should have readonly properties', () => {
      // These should be constant values - we can verify they exist but not modify them in strict mode
      expect(EvaluationPerList.read).toBeDefined();
      expect(EvaluationRoleList.read).toBeDefined();

      // Test that these are the expected constant references (same as common)
      expect(EvaluationPerList).toBe(CommonPerList);
      expect(EvaluationRoleList).toEqual(CommonRoleList);
    });
  });
});
