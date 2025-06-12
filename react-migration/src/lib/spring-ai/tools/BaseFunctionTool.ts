import type {
  FunctionTool,
  FunctionDefinition,
  FunctionCallRequest,
  FunctionCallResult,
  ToolExecutionContext,
  ValidationResult,
  ValidationError,
  FunctionParameter
} from './types';

/**
 * 기본 FunctionTool 추상 클래스
 */
export abstract class BaseFunctionTool implements FunctionTool {
  public readonly definition: FunctionDefinition;

  constructor(definition: FunctionDefinition) {
    this.definition = definition;
  }

  abstract execute(
    request: FunctionCallRequest, 
    context?: ToolExecutionContext
  ): Promise<FunctionCallResult>;

  /**
   * 매개변수 검증
   */
  validate(parameters: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];

    for (const param of this.definition.parameters) {
      const value = parameters[param.name];
      
      // 필수 매개변수 체크
      if (param.required && (value === undefined || value === null)) {
        errors.push({
          parameter: param.name,
          message: `Required parameter '${param.name}' is missing`,
          code: 'MISSING_REQUIRED_PARAMETER',
          value
        });
        continue;
      }

      // 값이 없으면 기본값 사용
      if (value === undefined || value === null) {
        if (param.default !== undefined) {
          parameters[param.name] = param.default;
        }
        continue;
      }

      // 타입 검증
      const typeError = this.validateType(param, value);
      if (typeError) {
        errors.push(typeError);
      }

      // 추가 제약 조건 검증
      const constraintError = this.validateConstraints(param, value);
      if (constraintError) {
        errors.push(constraintError);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 타입 검증
   */
  private validateType(param: FunctionParameter, value: any): ValidationError | null {
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            parameter: param.name,
            message: `Parameter '${param.name}' must be a string, got ${typeof value}`,
            code: 'INVALID_TYPE',
            value
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            parameter: param.name,
            message: `Parameter '${param.name}' must be a number, got ${typeof value}`,
            code: 'INVALID_TYPE',
            value
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            parameter: param.name,
            message: `Parameter '${param.name}' must be a boolean, got ${typeof value}`,
            code: 'INVALID_TYPE',
            value
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            parameter: param.name,
            message: `Parameter '${param.name}' must be an array, got ${typeof value}`,
            code: 'INVALID_TYPE',
            value
          };
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return {
            parameter: param.name,
            message: `Parameter '${param.name}' must be an object, got ${typeof value}`,
            code: 'INVALID_TYPE',
            value
          };
        }
        break;
    }

    return null;
  }

  /**
   * 제약 조건 검증
   */
  private validateConstraints(param: FunctionParameter, value: any): ValidationError | null {
    // enum 체크
    if (param.enum && !param.enum.includes(value)) {
      return {
        parameter: param.name,
        message: `Parameter '${param.name}' must be one of: ${param.enum.join(', ')}`,
        code: 'INVALID_ENUM_VALUE',
        value
      };
    }

    // 숫자 범위 체크
    if (param.type === 'number') {
      if (param.minimum !== undefined && value < param.minimum) {
        return {
          parameter: param.name,
          message: `Parameter '${param.name}' must be >= ${param.minimum}`,
          code: 'VALUE_TOO_SMALL',
          value
        };
      }

      if (param.maximum !== undefined && value > param.maximum) {
        return {
          parameter: param.name,
          message: `Parameter '${param.name}' must be <= ${param.maximum}`,
          code: 'VALUE_TOO_LARGE',
          value
        };
      }
    }

    // 문자열 길이 체크
    if (param.type === 'string') {
      if (param.minLength !== undefined && value.length < param.minLength) {
        return {
          parameter: param.name,
          message: `Parameter '${param.name}' must have at least ${param.minLength} characters`,
          code: 'STRING_TOO_SHORT',
          value
        };
      }

      if (param.maxLength !== undefined && value.length > param.maxLength) {
        return {
          parameter: param.name,
          message: `Parameter '${param.name}' must have at most ${param.maxLength} characters`,
          code: 'STRING_TOO_LONG',
          value
        };
      }

      // 패턴 체크
      if (param.pattern) {
        const regex = new RegExp(param.pattern);
        if (!regex.test(value)) {
          return {
            parameter: param.name,
            message: `Parameter '${param.name}' must match pattern: ${param.pattern}`,
            code: 'PATTERN_MISMATCH',
            value
          };
        }
      }
    }

    return null;
  }

  /**
   * 성공 결과 생성 헬퍼
   */
  protected createSuccessResult(result: any, callId?: string, executionTime?: number): FunctionCallResult {
    return {
      success: true,
      result,
      callId,
      executionTime,
      timestamp: new Date()
    };
  }

  /**
   * 오류 결과 생성 헬퍼
   */
  protected createErrorResult(
    code: string, 
    message: string, 
    details?: any, 
    callId?: string
  ): FunctionCallResult {
    return {
      success: false,
      error: {
        code,
        message,
        details
      },
      callId,
      timestamp: new Date()
    };
  }

  /**
   * 실행 시간 측정 래퍼
   */
  protected async measureExecution<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; executionTime: number }> {
    const startTime = Date.now();
    const result = await fn();
    const executionTime = Date.now() - startTime;
    
    return { result, executionTime };
  }
}