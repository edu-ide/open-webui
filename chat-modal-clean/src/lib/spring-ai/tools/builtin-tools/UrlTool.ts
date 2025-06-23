import { BaseFunctionTool } from '../BaseFunctionTool';
import type { 
  FunctionCallRequest, 
  FunctionCallResult, 
  ToolExecutionContext 
} from '../types';

/**
 * URL 관련 도구 - URL 분석, 단축, 검증 등
 */
export class UrlTool extends BaseFunctionTool {
  constructor() {
    super({
      name: 'url_utils',
      description: 'URL 관련 유틸리티 기능을 제공합니다',
      category: 'utility',
      tags: ['url', 'web', 'utility'],
      parameters: [
        {
          name: 'action',
          type: 'string',
          description: '수행할 작업',
          enum: ['parse', 'validate', 'shorten', 'expand', 'extract_domain'],
          required: true
        },
        {
          name: 'url',
          type: 'string',
          description: '처리할 URL',
          required: true,
          minLength: 1,
          maxLength: 2000
        }
      ],
      examples: [
        {
          description: 'URL 파싱',
          parameters: { 
            action: 'parse', 
            url: 'https://example.com/path?param=value#section' 
          }
        },
        {
          description: 'URL 검증',
          parameters: { 
            action: 'validate', 
            url: 'https://example.com' 
          }
        }
      ],
      returnType: 'object',
      returnDescription: 'URL 처리 결과'
    });
  }

  async execute(
    request: FunctionCallRequest,
    _context?: ToolExecutionContext
  ): Promise<FunctionCallResult> {
    try {
      const { action, url } = request.parameters;

      switch (action) {
        case 'parse':
          return this.parseUrl(url);
        case 'validate':
          return this.validateUrl(url);
        case 'shorten':
          return this.shortenUrl(url);
        case 'expand':
          return this.expandUrl(url);
        case 'extract_domain':
          return this.extractDomain(url);
        default:
          return this.createErrorResult(
            'INVALID_ACTION',
            `지원되지 않는 작업입니다: ${action}`
          );
      }

    } catch (error) {
      return this.createErrorResult(
        'URL_PROCESSING_ERROR',
        'URL 처리 중 오류가 발생했습니다',
        { 
          error: error instanceof Error ? error.message : String(error),
          url: request.parameters.url,
          action: request.parameters.action
        }
      );
    }
  }

  /**
   * URL 파싱
   */
  private parseUrl(urlString: string): FunctionCallResult {
    try {
      const url = new URL(urlString);
      
      const parsed = {
        original: urlString,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        origin: url.origin,
        searchParams: Object.fromEntries(url.searchParams.entries()),
        components: {
          scheme: url.protocol.replace(':', ''),
          domain: url.hostname,
          path: url.pathname,
          query: url.search.replace('?', ''),
          fragment: url.hash.replace('#', '')
        }
      };

      return this.createSuccessResult(parsed);

    } catch (error) {
      return this.createErrorResult(
        'INVALID_URL',
        '유효하지 않은 URL입니다',
        { url: urlString }
      );
    }
  }

  /**
   * URL 검증
   */
  private validateUrl(urlString: string): FunctionCallResult {
    try {
      const url = new URL(urlString);
      
      const validation = {
        url: urlString,
        valid: true,
        protocol: url.protocol,
        hasValidDomain: this.isValidDomain(url.hostname),
        isSecure: url.protocol === 'https:',
        hasPath: url.pathname !== '/',
        hasQuery: url.search !== '',
        hasFragment: url.hash !== '',
        checks: {
          syntax: true,
          domain: this.isValidDomain(url.hostname),
          port: this.isValidPort(url.port),
          protocol: ['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol)
        }
      };

      return this.createSuccessResult(validation);

    } catch (error) {
      return this.createSuccessResult({
        url: urlString,
        valid: false,
        error: 'URL 구문이 유효하지 않습니다',
        checks: {
          syntax: false,
          domain: false,
          port: false,
          protocol: false
        }
      });
    }
  }

  /**
   * URL 단축 (데모 구현)
   */
  private shortenUrl(urlString: string): FunctionCallResult {
    try {
      // URL 유효성 검사
      new URL(urlString);

      // 실제로는 bit.ly, tinyurl 등의 서비스를 사용
      const shortCode = this.generateShortCode();
      const shortened = `https://short.ly/${shortCode}`;

      const result = {
        original: urlString,
        shortened: shortened,
        shortCode: shortCode,
        service: 'demo',
        createdAt: new Date(),
        clicks: 0
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'INVALID_URL',
        '유효하지 않은 URL입니다',
        { url: urlString }
      );
    }
  }

  /**
   * 단축 URL 확장 (데모 구현)
   */
  private expandUrl(urlString: string): FunctionCallResult {
    try {
      // 데모 구현 - 실제로는 HTTP HEAD 요청으로 리다이렉트 확인
      const expanded = urlString.includes('short.ly') 
        ? 'https://example.com/expanded-url'
        : urlString;

      const result = {
        original: urlString,
        expanded: expanded,
        redirectChain: [urlString, expanded],
        finalUrl: expanded,
        redirectCount: urlString !== expanded ? 1 : 0
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(
        'EXPANSION_ERROR',
        'URL 확장 중 오류가 발생했습니다',
        { url: urlString }
      );
    }
  }

  /**
   * 도메인 추출
   */
  private extractDomain(urlString: string): FunctionCallResult {
    try {
      const url = new URL(urlString);
      
      const domain = {
        full: url.hostname,
        root: this.getRootDomain(url.hostname),
        subdomain: this.getSubdomain(url.hostname),
        tld: this.getTLD(url.hostname),
        isIp: this.isIpAddress(url.hostname),
        port: url.port
      };

      return this.createSuccessResult(domain);

    } catch (error) {
      return this.createErrorResult(
        'INVALID_URL',
        '유효하지 않은 URL입니다',
        { url: urlString }
      );
    }
  }

  /**
   * 도메인 유효성 검사
   */
  private isValidDomain(hostname: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(hostname) && hostname.length <= 253;
  }

  /**
   * 포트 유효성 검사
   */
  private isValidPort(port: string): boolean {
    if (!port) return true;
    const portNum = parseInt(port, 10);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  }

  /**
   * IP 주소 확인
   */
  private isIpAddress(hostname: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(hostname) || ipv6Regex.test(hostname);
  }

  /**
   * 루트 도메인 추출
   */
  private getRootDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  }

  /**
   * 서브도메인 추출
   */
  private getSubdomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length > 2) {
      return parts.slice(0, -2).join('.');
    }
    return '';
  }

  /**
   * TLD 추출
   */
  private getTLD(hostname: string): string {
    const parts = hostname.split('.');
    return parts[parts.length - 1];
  }

  /**
   * 짧은 코드 생성
   */
  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}