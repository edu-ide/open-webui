import { BaseFunctionTool } from '../BaseFunctionTool';
import type { 
  FunctionCallRequest, 
  FunctionCallResult, 
  ToolExecutionContext 
} from '../types';

/**
 * 계산기 도구 - 수학 계산 수행
 */
export class CalculatorTool extends BaseFunctionTool {
  constructor() {
    super({
      name: 'calculator',
      description: '기본적인 수학 계산을 수행합니다',
      category: 'math',
      tags: ['calculator', 'math', 'arithmetic'],
      parameters: [
        {
          name: 'expression',
          type: 'string',
          description: '계산할 수학 표현식 (예: "2 + 3 * 4")',
          required: true,
          pattern: '^[0-9+\\-*/().\\s]+$'
        }
      ],
      examples: [
        {
          description: '기본 사칙연산',
          parameters: { expression: '10 + 5 * 2' },
          expectedResult: 20
        },
        {
          description: '괄호가 포함된 계산',
          parameters: { expression: '(15 + 5) / 4' },
          expectedResult: 5
        }
      ],
      returnType: 'number',
      returnDescription: '계산 결과'
    });
  }

  async execute(
    request: FunctionCallRequest,
    _context?: ToolExecutionContext
  ): Promise<FunctionCallResult> {
    try {
      const { expression } = request.parameters;
      
      // 안전한 수학 표현식인지 검증
      if (!this.isSafeMathExpression(expression)) {
        return this.createErrorResult(
          'UNSAFE_EXPRESSION',
          '허용되지 않는 문자나 함수가 포함된 표현식입니다',
          { expression }
        );
      }

      // Math.js 대신 간단한 파서 사용 (보안상 안전)
      const result = this.evaluateExpression(expression);

      return this.createSuccessResult({
        expression,
        result,
        formatted: `${expression} = ${result}`
      });

    } catch (error) {
      return this.createErrorResult(
        'CALCULATION_ERROR',
        '계산 중 오류가 발생했습니다',
        { 
          error: error instanceof Error ? error.message : String(error),
          expression: request.parameters.expression 
        }
      );
    }
  }

  /**
   * 안전한 수학 표현식인지 검증
   */
  private isSafeMathExpression(expression: string): boolean {
    // 허용된 문자만 포함되어 있는지 검사
    const allowedPattern = /^[0-9+\-*/().\s]+$/;
    if (!allowedPattern.test(expression)) {
      return false;
    }

    // 위험한 패턴 검사
    const dangerousPatterns = [
      /function/i,
      /eval/i,
      /while/i,
      /for/i,
      /if/i,
      /var/i,
      /let/i,
      /const/i,
      /return/i,
      /console/i,
      /alert/i,
      /document/i,
      /window/i,
      /process/i,
      /require/i,
      /import/i,
      /export/i
    ];

    return !dangerousPatterns.some(pattern => pattern.test(expression));
  }

  /**
   * 수학 표현식 계산 (안전한 파서)
   */
  private evaluateExpression(expression: string): number {
    // 공백 제거
    const cleaned = expression.replace(/\s+/g, '');
    
    try {
      // Function 생성자 대신 안전한 파싱 사용
      // 간단한 중위 표기법 파서 구현
      return this.parseExpression(cleaned);
    } catch (error) {
      throw new Error('잘못된 수학 표현식입니다');
    }
  }

  /**
   * 간단한 수학 표현식 파서
   */
  private parseExpression(expr: string): number {
    // 괄호 처리
    while (expr.includes('(')) {
      const lastOpen = expr.lastIndexOf('(');
      const nextClose = expr.indexOf(')', lastOpen);
      
      if (nextClose === -1) {
        throw new Error('괄호가 닫히지 않았습니다');
      }
      
      const innerExpr = expr.substring(lastOpen + 1, nextClose);
      const innerResult = this.parseSimpleExpression(innerExpr);
      
      expr = expr.substring(0, lastOpen) + innerResult + expr.substring(nextClose + 1);
    }
    
    return this.parseSimpleExpression(expr);
  }

  /**
   * 괄호가 없는 간단한 표현식 파싱
   */
  private parseSimpleExpression(expr: string): number {
    // 곱셈과 나눗셈 먼저 처리
    expr = this.processOperations(expr, ['*', '/']);
    
    // 덧셈과 뺄셈 처리
    expr = this.processOperations(expr, ['+', '-']);
    
    const result = parseFloat(expr);
    if (isNaN(result)) {
      throw new Error('숫자로 변환할 수 없습니다');
    }
    
    return result;
  }

  /**
   * 특정 연산자들 처리
   */
  private processOperations(expr: string, operators: string[]): string {
    for (const op of operators) {
      while (expr.includes(op)) {
        let opIndex = -1;
        
        // 연산자 찾기 (음수 처리)
        for (let i = 1; i < expr.length; i++) {
          if (expr[i] === op) {
            opIndex = i;
            break;
          }
        }
        
        if (opIndex === -1) break;
        
        // 좌측 피연산자 찾기
        let leftStart = opIndex - 1;
        while (leftStart > 0 && /[0-9.]/.test(expr[leftStart - 1])) {
          leftStart--;
        }
        
        // 우측 피연산자 찾기
        let rightEnd = opIndex + 1;
        if (expr[rightEnd] === '-' || expr[rightEnd] === '+') {
          rightEnd++; // 음수/양수 부호 포함
        }
        while (rightEnd < expr.length && /[0-9.]/.test(expr[rightEnd])) {
          rightEnd++;
        }
        
        const left = parseFloat(expr.substring(leftStart, opIndex));
        const right = parseFloat(expr.substring(opIndex + 1, rightEnd));
        
        let result: number;
        switch (op) {
          case '+':
            result = left + right;
            break;
          case '-':
            result = left - right;
            break;
          case '*':
            result = left * right;
            break;
          case '/':
            if (right === 0) {
              throw new Error('0으로 나눌 수 없습니다');
            }
            result = left / right;
            break;
          default:
            throw new Error(`지원되지 않는 연산자: ${op}`);
        }
        
        expr = expr.substring(0, leftStart) + result + expr.substring(rightEnd);
      }
    }
    
    return expr;
  }
}