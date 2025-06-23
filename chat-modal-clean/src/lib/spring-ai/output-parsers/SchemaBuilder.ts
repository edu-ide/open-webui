import type { Schema, SchemaProperty, SchemaBuilder as ISchemaBuilder, SchemaTemplate } from './types';

/**
 * 스키마 빌더 구현
 */
export class SchemaBuilder implements ISchemaBuilder {
  string(options: { 
    minLength?: number; 
    maxLength?: number; 
    format?: string; 
    enum?: string[];
    description?: string;
  } = {}): SchemaProperty {
    const property: SchemaProperty = {
      type: 'string',
      description: options.description
    };

    if (options.minLength !== undefined) property.minLength = options.minLength;
    if (options.maxLength !== undefined) property.maxLength = options.maxLength;
    if (options.format) property.format = options.format;
    if (options.enum) property.enum = options.enum;

    return property;
  }

  number(options: { 
    minimum?: number; 
    maximum?: number; 
    description?: string;
  } = {}): SchemaProperty {
    const property: SchemaProperty = {
      type: 'number',
      description: options.description
    };

    if (options.minimum !== undefined) property.minimum = options.minimum;
    if (options.maximum !== undefined) property.maximum = options.maximum;

    return property;
  }

  boolean(options: { 
    description?: string;
  } = {}): SchemaProperty {
    return {
      type: 'boolean',
      description: options.description
    };
  }

  array(items: SchemaProperty, options: { 
    minItems?: number; 
    maxItems?: number;
    description?: string;
  } = {}): SchemaProperty {
    const property: SchemaProperty = {
      type: 'array',
      items: items as Schema,
      description: options.description
    };

    return property;
  }

  object(properties: Record<string, SchemaProperty>, options: {
    required?: string[];
    description?: string;
  } = {}): SchemaProperty {
    return {
      type: 'object',
      properties,
      required: options.required,
      description: options.description
    };
  }

  enum(values: any[], options: {
    description?: string;
  } = {}): SchemaProperty {
    return {
      type: 'string',
      enum: values,
      description: options.description
    };
  }
}

/**
 * 스키마 빌더 팩토리
 */
export const schema = new SchemaBuilder();

/**
 * 미리 정의된 스키마 템플릿들
 */
export class SchemaTemplates {
  /**
   * 기본 템플릿들
   */
  static readonly templates: SchemaTemplate[] = [
    {
      name: 'User Profile',
      description: '사용자 프로필 정보',
      schema: {
        type: 'object',
        properties: {
          id: schema.number({ description: '사용자 ID' }),
          name: schema.string({ description: '사용자 이름', minLength: 1, maxLength: 100 }),
          email: schema.string({ format: 'email', description: '이메일 주소' }),
          age: schema.number({ minimum: 0, maximum: 150, description: '나이' }),
          isActive: schema.boolean({ description: '활성 상태' }),
          tags: schema.array(schema.string(), { description: '태그 목록' })
        },
        required: ['id', 'name', 'email']
      },
      example: {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        isActive: true,
        tags: ['developer', 'javascript']
      }
    },
    {
      name: 'Product Info',
      description: '상품 정보',
      schema: {
        type: 'object',
        properties: {
          id: schema.string({ description: '상품 ID' }),
          name: schema.string({ description: '상품명', minLength: 1 }),
          price: schema.number({ minimum: 0, description: '가격' }),
          category: schema.enum(['electronics', 'clothing', 'books', 'food'], { 
            description: '카테고리' 
          }),
          inStock: schema.boolean({ description: '재고 여부' }),
          specifications: schema.object({
            weight: schema.number({ description: '무게 (kg)' }),
            dimensions: schema.object({
              width: schema.number(),
              height: schema.number(),
              depth: schema.number()
            }, { required: ['width', 'height', 'depth'] })
          })
        },
        required: ['id', 'name', 'price', 'category']
      },
      example: {
        id: 'prod-123',
        name: 'Wireless Headphones',
        price: 99.99,
        category: 'electronics',
        inStock: true,
        specifications: {
          weight: 0.25,
          dimensions: {
            width: 15,
            height: 18,
            depth: 7
          }
        }
      }
    },
    {
      name: 'Task List',
      description: '작업 목록',
      schema: {
        type: 'object',
        properties: {
          title: schema.string({ description: '목록 제목' }),
          tasks: schema.array(
            schema.object({
              id: schema.string({ description: '작업 ID' }),
              title: schema.string({ description: '작업 제목' }),
              description: schema.string({ description: '작업 설명' }),
              completed: schema.boolean({ description: '완료 여부' }),
              priority: schema.enum(['low', 'medium', 'high'], { 
                description: '우선순위' 
              }),
              dueDate: schema.string({ format: 'date', description: '마감일' })
            }, { required: ['id', 'title', 'completed', 'priority'] }),
            { description: '작업 목록' }
          ),
          createdAt: schema.string({ format: 'date-time', description: '생성일시' })
        },
        required: ['title', 'tasks']
      },
      example: {
        title: 'Weekly Tasks',
        tasks: [
          {
            id: 'task-1',
            title: 'Review code',
            description: 'Review the new feature implementation',
            completed: false,
            priority: 'high',
            dueDate: '2025-06-05'
          },
          {
            id: 'task-2',
            title: 'Update documentation',
            description: 'Update API documentation',
            completed: true,
            priority: 'medium',
            dueDate: '2025-06-04'
          }
        ],
        createdAt: '2025-06-04T10:00:00Z'
      }
    },
    {
      name: 'Analytics Report',
      description: '분석 리포트',
      schema: {
        type: 'object',
        properties: {
          reportId: schema.string({ description: '리포트 ID' }),
          period: schema.object({
            startDate: schema.string({ format: 'date', description: '시작일' }),
            endDate: schema.string({ format: 'date', description: '종료일' })
          }, { required: ['startDate', 'endDate'] }),
          metrics: schema.object({
            totalUsers: schema.number({ description: '총 사용자 수' }),
            activeUsers: schema.number({ description: '활성 사용자 수' }),
            revenue: schema.number({ description: '수익' }),
            conversionRate: schema.number({ minimum: 0, maximum: 1, description: '전환율' })
          }, { required: ['totalUsers', 'activeUsers'] }),
          topPages: schema.array(
            schema.object({
              url: schema.string({ description: 'URL' }),
              views: schema.number({ description: '조회수' }),
              uniqueViews: schema.number({ description: '고유 조회수' })
            }, { required: ['url', 'views'] }),
            { description: '인기 페이지 목록' }
          )
        },
        required: ['reportId', 'period', 'metrics']
      },
      example: {
        reportId: 'report-2025-06',
        period: {
          startDate: '2025-06-01',
          endDate: '2025-06-04'
        },
        metrics: {
          totalUsers: 15420,
          activeUsers: 12350,
          revenue: 45678.90,
          conversionRate: 0.067
        },
        topPages: [
          {
            url: '/dashboard',
            views: 5430,
            uniqueViews: 4120
          },
          {
            url: '/products',
            views: 3210,
            uniqueViews: 2890
          }
        ]
      }
    }
  ];

  /**
   * 템플릿 검색
   */
  static findTemplate(name: string): SchemaTemplate | undefined {
    return this.templates.find(template => 
      template.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * 모든 템플릿 이름 조회
   */
  static getTemplateNames(): string[] {
    return this.templates.map(template => template.name);
  }

  /**
   * 카테고리별 템플릿 조회
   */
  static getTemplatesByCategory(): Record<string, SchemaTemplate[]> {
    return {
      'User & Profile': this.templates.filter(t => 
        t.name.includes('User') || t.name.includes('Profile')
      ),
      'E-commerce': this.templates.filter(t => 
        t.name.includes('Product') || t.name.includes('Order')
      ),
      'Task Management': this.templates.filter(t => 
        t.name.includes('Task') || t.name.includes('Todo')
      ),
      'Analytics': this.templates.filter(t => 
        t.name.includes('Analytics') || t.name.includes('Report')
      )
    };
  }
}

/**
 * 스키마 유틸리티 함수들
 */
export class SchemaUtils {
  /**
   * 스키마 병합
   */
  static mergeSchemas(schema1: Schema, schema2: Schema): Schema {
    if (schema1.type !== schema2.type) {
      throw new Error('Cannot merge schemas of different types');
    }

    const merged: Schema = { ...schema1 };

    if (schema1.type === 'object' && schema2.type === 'object') {
      merged.properties = {
        ...schema1.properties,
        ...schema2.properties
      };
      
      const required1 = schema1.required || [];
      const required2 = schema2.required || [];
      merged.required = [...new Set([...required1, ...required2])];
    }

    return merged;
  }

  /**
   * 스키마 유효성 검사
   */
  static validateSchema(schema: Schema): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema.type) {
      errors.push('Schema must have a type');
    }

    if (schema.type === 'object') {
      if (schema.required) {
        const properties = Object.keys(schema.properties || {});
        for (const required of schema.required) {
          if (!properties.includes(required)) {
            errors.push(`Required property '${required}' not found in properties`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 스키마에서 TypeScript 인터페이스 생성
   */
  static generateTypeScript(schema: Schema, interfaceName: string = 'GeneratedType'): string {
    return `interface ${interfaceName} {\n${this.schemaToTypeScript(schema, 1)}\n}`;
  }

  private static schemaToTypeScript(schema: Schema, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    
    switch (schema.type) {
      case 'object':
        if (!schema.properties) return '{}';
        
        const properties = Object.entries(schema.properties).map(([key, prop]) => {
          const optional = !schema.required?.includes(key) ? '?' : '';
          const propType = this.schemaToTypeScript(prop as Schema, 0);
          return `${spaces}${key}${optional}: ${propType};`;
        });
        
        return properties.join('\n');
        
      case 'array':
        if (!schema.items) return 'any[]';
        const itemType = this.schemaToTypeScript(schema.items, 0);
        return `${itemType}[]`;
        
      case 'string':
        if (schema.enum) {
          return schema.enum.map(val => `'${val}'`).join(' | ');
        }
        return 'string';
        
      case 'number':
      case 'integer':
        return 'number';
        
      case 'boolean':
        return 'boolean';
        
      default:
        return 'any';
    }
  }
}