import { BaseFunctionTool } from '../BaseFunctionTool';
import type { 
  FunctionCallRequest, 
  FunctionCallResult, 
  ToolExecutionContext 
} from '../types';

/**
 * 시간 관련 도구 - 현재 시간, 시간대 변환, 포맷팅 등
 */
export class TimeTool extends BaseFunctionTool {
  constructor() {
    super({
      name: 'time_utils',
      description: '시간 관련 유틸리티 기능을 제공합니다',
      category: 'time',
      tags: ['time', 'date', 'timezone', 'utility'],
      parameters: [
        {
          name: 'action',
          type: 'string',
          description: '수행할 작업',
          enum: ['current', 'format', 'convert_timezone', 'parse', 'diff', 'add', 'subtract'],
          required: true
        },
        {
          name: 'timezone',
          type: 'string',
          description: '시간대 (예: Asia/Seoul, America/New_York)',
          default: 'Asia/Seoul'
        },
        {
          name: 'format',
          type: 'string',
          description: '시간 포맷 (예: YYYY-MM-DD HH:mm:ss)',
          default: 'YYYY-MM-DD HH:mm:ss'
        },
        {
          name: 'date_string',
          type: 'string',
          description: '파싱하거나 변환할 날짜 문자열'
        },
        {
          name: 'amount',
          type: 'number',
          description: '추가하거나 빼는 시간 양'
        },
        {
          name: 'unit',
          type: 'string',
          description: '시간 단위',
          enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years']
        },
        {
          name: 'target_timezone',
          type: 'string',
          description: '변환할 대상 시간대'
        },
        {
          name: 'compare_date',
          type: 'string',
          description: '비교할 날짜'
        }
      ],
      examples: [
        {
          description: '현재 시간 조회',
          parameters: { 
            action: 'current', 
            timezone: 'Asia/Seoul' 
          }
        },
        {
          description: '시간대 변환',
          parameters: { 
            action: 'convert_timezone',
            date_string: '2024-01-01 12:00:00',
            timezone: 'Asia/Seoul',
            target_timezone: 'America/New_York'
          }
        }
      ],
      returnType: 'object',
      returnDescription: '시간 처리 결과'
    });
  }

  async execute(
    request: FunctionCallRequest,
    _context?: ToolExecutionContext
  ): Promise<FunctionCallResult> {
    try {
      const { action } = request.parameters;

      switch (action) {
        case 'current':
          return this.getCurrentTime(request.parameters);
        case 'format':
          return this.formatTime(request.parameters);
        case 'convert_timezone':
          return this.convertTimezone(request.parameters);
        case 'parse':
          return this.parseTime(request.parameters);
        case 'diff':
          return this.timeDifference(request.parameters);
        case 'add':
          return this.addTime(request.parameters);
        case 'subtract':
          return this.subtractTime(request.parameters);
        default:
          return this.createErrorResult(
            'INVALID_ACTION',
            `지원되지 않는 작업입니다: ${action}`
          );
      }

    } catch (error) {
      return this.createErrorResult(
        'TIME_PROCESSING_ERROR',
        '시간 처리 중 오류가 발생했습니다',
        { 
          error: error instanceof Error ? error.message : String(error),
          action: request.parameters.action
        }
      );
    }
  }

  /**
   * 현재 시간 조회
   */
  private getCurrentTime(params: any): FunctionCallResult {
    try {
      const { timezone = 'Asia/Seoul', format = 'YYYY-MM-DD HH:mm:ss' } = params;
      const now = new Date();

      const result = {
        current_time: now,
        timezone: timezone,
        formatted: this.formatDate(now, format),
        iso_string: now.toISOString(),
        unix_timestamp: Math.floor(now.getTime() / 1000),
        milliseconds: now.getTime(),
        utc: {
          formatted: this.formatDate(now, format, 'UTC'),
          iso: now.toISOString()
        },
        local_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezone_offset: now.getTimezoneOffset(),
        weekday: now.toLocaleDateString('ko-KR', { weekday: 'long' }),
        is_weekend: now.getDay() === 0 || now.getDay() === 6
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'CURRENT_TIME_ERROR',
        '현재 시간 조회 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 시간 포맷팅
   */
  private formatTime(params: any): FunctionCallResult {
    try {
      const { date_string, format = 'YYYY-MM-DD HH:mm:ss', timezone } = params;
      
      if (!date_string) {
        return this.createErrorResult('MISSING_DATE', '날짜 문자열이 필요합니다');
      }

      const date = new Date(date_string);
      if (isNaN(date.getTime())) {
        return this.createErrorResult('INVALID_DATE', '유효하지 않은 날짜입니다');
      }

      const formatted = this.formatDate(date, format, timezone);

      const result = {
        original: date_string,
        parsed_date: date,
        formatted: formatted,
        format_used: format,
        timezone: timezone || 'local',
        various_formats: {
          iso: date.toISOString(),
          local: date.toLocaleString('ko-KR'),
          date_only: date.toLocaleDateString('ko-KR'),
          time_only: date.toLocaleTimeString('ko-KR'),
          unix: Math.floor(date.getTime() / 1000)
        }
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'FORMAT_ERROR',
        '시간 포맷팅 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 시간대 변환
   */
  private convertTimezone(params: any): FunctionCallResult {
    try {
      const { date_string, timezone = 'Asia/Seoul', target_timezone } = params;
      
      if (!date_string) {
        return this.createErrorResult('MISSING_DATE', '날짜 문자열이 필요합니다');
      }
      
      if (!target_timezone) {
        return this.createErrorResult('MISSING_TARGET_TIMEZONE', '대상 시간대가 필요합니다');
      }

      const date = new Date(date_string);
      if (isNaN(date.getTime())) {
        return this.createErrorResult('INVALID_DATE', '유효하지 않은 날짜입니다');
      }

      const result = {
        original: {
          date: date_string,
          timezone: timezone,
          formatted: date.toLocaleString('ko-KR', { timeZone: timezone })
        },
        converted: {
          timezone: target_timezone,
          formatted: date.toLocaleString('ko-KR', { timeZone: target_timezone }),
          iso: date.toISOString()
        },
        timezone_info: {
          source_offset: this.getTimezoneOffset(timezone),
          target_offset: this.getTimezoneOffset(target_timezone),
          difference_hours: this.getTimezoneDifference(timezone, target_timezone)
        }
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'TIMEZONE_CONVERSION_ERROR',
        '시간대 변환 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 시간 파싱
   */
  private parseTime(params: any): FunctionCallResult {
    try {
      const { date_string } = params;
      
      if (!date_string) {
        return this.createErrorResult('MISSING_DATE', '날짜 문자열이 필요합니다');
      }

      const date = new Date(date_string);
      if (isNaN(date.getTime())) {
        return this.createErrorResult('INVALID_DATE', '유효하지 않은 날짜입니다');
      }

      const result = {
        original: date_string,
        parsed: {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hour: date.getHours(),
          minute: date.getMinutes(),
          second: date.getSeconds(),
          millisecond: date.getMilliseconds(),
          weekday: date.getDay(),
          weekday_name: date.toLocaleDateString('ko-KR', { weekday: 'long' })
        },
        timestamps: {
          unix: Math.floor(date.getTime() / 1000),
          milliseconds: date.getTime(),
          iso: date.toISOString()
        },
        relative: {
          from_now: this.getRelativeTime(date),
          is_past: date < new Date(),
          is_future: date > new Date()
        }
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'PARSE_ERROR',
        '시간 파싱 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 시간 차이 계산
   */
  private timeDifference(params: any): FunctionCallResult {
    try {
      const { date_string, compare_date } = params;
      
      if (!date_string || !compare_date) {
        return this.createErrorResult('MISSING_DATES', '비교할 두 날짜가 필요합니다');
      }

      const date1 = new Date(date_string);
      const date2 = new Date(compare_date);

      if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
        return this.createErrorResult('INVALID_DATE', '유효하지 않은 날짜입니다');
      }

      const diffMs = Math.abs(date2.getTime() - date1.getTime());
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      const result = {
        date1: date_string,
        date2: compare_date,
        difference: {
          milliseconds: diffMs,
          seconds: diffSeconds,
          minutes: diffMinutes,
          hours: diffHours,
          days: diffDays,
          weeks: Math.floor(diffDays / 7),
          months: Math.floor(diffDays / 30.44),
          years: Math.floor(diffDays / 365.25)
        },
        human_readable: this.getHumanReadableDiff(diffMs),
        earlier: date1 < date2 ? date_string : compare_date,
        later: date1 > date2 ? date_string : compare_date
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'DIFF_ERROR',
        '시간 차이 계산 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 시간 더하기
   */
  private addTime(params: any): FunctionCallResult {
    try {
      const { date_string, amount, unit } = params;
      
      if (!date_string || amount === undefined || !unit) {
        return this.createErrorResult('MISSING_PARAMS', '날짜, 양, 단위가 모두 필요합니다');
      }

      const date = new Date(date_string);
      if (isNaN(date.getTime())) {
        return this.createErrorResult('INVALID_DATE', '유효하지 않은 날짜입니다');
      }

      const result = this.modifyDate(date, amount, unit, 'add');
      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'ADD_TIME_ERROR',
        '시간 더하기 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 시간 빼기
   */
  private subtractTime(params: any): FunctionCallResult {
    try {
      const { date_string, amount, unit } = params;
      
      if (!date_string || amount === undefined || !unit) {
        return this.createErrorResult('MISSING_PARAMS', '날짜, 양, 단위가 모두 필요합니다');
      }

      const date = new Date(date_string);
      if (isNaN(date.getTime())) {
        return this.createErrorResult('INVALID_DATE', '유효하지 않은 날짜입니다');
      }

      const result = this.modifyDate(date, amount, unit, 'subtract');
      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'SUBTRACT_TIME_ERROR',
        '시간 빼기 실패',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 날짜 포맷팅 헬퍼
   */
  private formatDate(date: Date, _format: string, timezone?: string): string {
    const options: Intl.DateTimeFormatOptions = {};
    
    if (timezone) {
      options.timeZone = timezone;
    }

    // 간단한 포맷 변환
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...options
    });
  }

  /**
   * 상대적 시간 표현
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    
    if (Math.abs(diffMinutes) < 1) return '방금';
    if (Math.abs(diffMinutes) < 60) {
      return diffMinutes > 0 ? `${diffMinutes}분 후` : `${Math.abs(diffMinutes)}분 전`;
    }
    
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return diffHours > 0 ? `${diffHours}시간 후` : `${Math.abs(diffHours)}시간 전`;
    }
    
    const diffDays = Math.round(diffHours / 24);
    return diffDays > 0 ? `${diffDays}일 후` : `${Math.abs(diffDays)}일 전`;
  }

  /**
   * 사람이 읽기 쉬운 시간 차이
   */
  private getHumanReadableDiff(diffMs: number): string {
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 ${hours % 24}시간`;
    if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
    if (minutes > 0) return `${minutes}분 ${seconds % 60}초`;
    return `${seconds}초`;
  }

  /**
   * 날짜 수정 (더하기/빼기)
   */
  private modifyDate(date: Date, amount: number, unit: string, operation: 'add' | 'subtract') {
    const newDate = new Date(date);
    const multiplier = operation === 'add' ? 1 : -1;
    const value = amount * multiplier;

    switch (unit) {
      case 'seconds':
        newDate.setSeconds(newDate.getSeconds() + value);
        break;
      case 'minutes':
        newDate.setMinutes(newDate.getMinutes() + value);
        break;
      case 'hours':
        newDate.setHours(newDate.getHours() + value);
        break;
      case 'days':
        newDate.setDate(newDate.getDate() + value);
        break;
      case 'weeks':
        newDate.setDate(newDate.getDate() + (value * 7));
        break;
      case 'months':
        newDate.setMonth(newDate.getMonth() + value);
        break;
      case 'years':
        newDate.setFullYear(newDate.getFullYear() + value);
        break;
      default:
        throw new Error(`지원되지 않는 시간 단위: ${unit}`);
    }

    return {
      original: date.toISOString(),
      modified: newDate.toISOString(),
      operation: operation,
      amount: amount,
      unit: unit,
      difference: {
        milliseconds: newDate.getTime() - date.getTime(),
        human_readable: this.getHumanReadableDiff(Math.abs(newDate.getTime() - date.getTime()))
      }
    };
  }

  /**
   * 시간대 오프셋 (데모)
   */
  private getTimezoneOffset(timezone: string): string {
    const offsets: Record<string, string> = {
      'Asia/Seoul': '+09:00',
      'America/New_York': '-05:00',
      'Europe/London': '+00:00',
      'Asia/Tokyo': '+09:00',
      'UTC': '+00:00'
    };
    return offsets[timezone] || '+00:00';
  }

  /**
   * 시간대 차이 (데모)
   */
  private getTimezoneDifference(from: string, to: string): number {
    const offsets: Record<string, number> = {
      'Asia/Seoul': 9,
      'America/New_York': -5,
      'Europe/London': 0,
      'Asia/Tokyo': 9,
      'UTC': 0
    };
    return (offsets[to] || 0) - (offsets[from] || 0);
  }
}