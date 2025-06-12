import { BaseFunctionTool } from '../BaseFunctionTool';
import type { 
  FunctionCallRequest, 
  FunctionCallResult, 
  ToolExecutionContext 
} from '../types';

/**
 * 날씨 정보 도구 - OpenWeatherMap API 활용
 */
export class WeatherTool extends BaseFunctionTool {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor(apiKey?: string) {
    super({
      name: 'weather',
      description: '현재 날씨 정보를 조회합니다',
      category: 'api',
      tags: ['weather', 'api', 'forecast'],
      parameters: [
        {
          name: 'location',
          type: 'string',
          description: '날씨를 조회할 도시명 또는 좌표 (예: "Seoul", "37.5665,126.9780")',
          required: true,
          minLength: 1,
          maxLength: 100
        },
        {
          name: 'units',
          type: 'string',
          description: '온도 단위',
          enum: ['metric', 'imperial', 'kelvin'],
          default: 'metric'
        },
        {
          name: 'lang',
          type: 'string',
          description: '언어 코드',
          enum: ['ko', 'en', 'ja', 'zh'],
          default: 'ko'
        }
      ],
      examples: [
        {
          description: '서울 날씨 조회',
          parameters: { location: 'Seoul', units: 'metric', lang: 'ko' },
          expectedResult: {
            location: 'Seoul',
            temperature: 22,
            description: '맑음',
            humidity: 65
          }
        }
      ],
      returnType: 'object',
      returnDescription: '날씨 정보 객체'
    });

    this.apiKey = apiKey || process.env.OPENWEATHER_API_KEY || 'demo_key';
  }

  async execute(
    request: FunctionCallRequest,
    _context?: ToolExecutionContext
  ): Promise<FunctionCallResult> {
    try {
      const { location, units = 'metric', lang = 'ko' } = request.parameters;

      // API 키 확인
      if (this.apiKey === 'demo_key') {
        return this.createDemoWeatherResult(location, units, lang);
      }

      // 좌표인지 도시명인지 판단
      const isCoordinate = /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(location);
      
      let url: string;
      if (isCoordinate) {
        const [lat, lon] = location.split(',');
        url = `${this.baseUrl}/weather?lat=${lat}&lon=${lon}&units=${units}&lang=${lang}&appid=${this.apiKey}`;
      } else {
        url = `${this.baseUrl}/weather?q=${encodeURIComponent(location)}&units=${units}&lang=${lang}&appid=${this.apiKey}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          return this.createErrorResult(
            'LOCATION_NOT_FOUND',
            '해당 위치를 찾을 수 없습니다',
            { location }
          );
        } else if (response.status === 401) {
          return this.createErrorResult(
            'INVALID_API_KEY',
            'API 키가 유효하지 않습니다'
          );
        } else {
          return this.createErrorResult(
            'API_ERROR',
            `날씨 API 호출 실패: ${response.status}`
          );
        }
      }

      const data = await response.json();
      
      const weatherInfo = {
        location: data.name,
        country: data.sys.country,
        coordinates: {
          lat: data.coord.lat,
          lon: data.coord.lon
        },
        temperature: {
          current: Math.round(data.main.temp),
          feels_like: Math.round(data.main.feels_like),
          min: Math.round(data.main.temp_min),
          max: Math.round(data.main.temp_max)
        },
        weather: {
          main: data.weather[0].main,
          description: data.weather[0].description,
          icon: data.weather[0].icon
        },
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        visibility: data.visibility ? Math.round(data.visibility / 1000) : null,
        wind: {
          speed: data.wind?.speed || 0,
          direction: data.wind?.deg || 0
        },
        clouds: data.clouds?.all || 0,
        sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString(),
        sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString(),
        timestamp: new Date(data.dt * 1000),
        units: this.getUnitsInfo(units)
      };

      return this.createSuccessResult(weatherInfo);

    } catch (error) {
      return this.createErrorResult(
        'WEATHER_ERROR',
        '날씨 정보 조회 중 오류가 발생했습니다',
        { 
          error: error instanceof Error ? error.message : String(error),
          location: request.parameters.location 
        }
      );
    }
  }

  /**
   * 데모용 날씨 데이터 생성
   */
  private createDemoWeatherResult(location: string, units: string, lang: string): FunctionCallResult {
    const demoData = {
      location: location,
      country: 'KR',
      coordinates: { lat: 37.5665, lon: 126.9780 },
      temperature: {
        current: units === 'imperial' ? 72 : 22,
        feels_like: units === 'imperial' ? 75 : 24,
        min: units === 'imperial' ? 68 : 20,
        max: units === 'imperial' ? 78 : 26
      },
      weather: {
        main: 'Clear',
        description: lang === 'ko' ? '맑음' : 'clear sky',
        icon: '01d'
      },
      humidity: 65,
      pressure: 1013,
      visibility: 10,
      wind: { speed: 3.5, direction: 180 },
      clouds: 0,
      sunrise: '06:30:00',
      sunset: '18:45:00',
      timestamp: new Date(),
      units: this.getUnitsInfo(units),
      demo: true
    };

    return this.createSuccessResult(demoData);
  }

  /**
   * 단위 정보 반환
   */
  private getUnitsInfo(units: string) {
    switch (units) {
      case 'imperial':
        return { temperature: '°F', speed: 'mph', pressure: 'hPa' };
      case 'kelvin':
        return { temperature: 'K', speed: 'm/s', pressure: 'hPa' };
      default: // metric
        return { temperature: '°C', speed: 'm/s', pressure: 'hPa' };
    }
  }
}