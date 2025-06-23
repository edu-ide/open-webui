import React, { useState, useMemo } from 'react';
import { Input, Select, Button, Space, Spin, Alert, Row, Col, Card, Tag, Avatar } from 'antd';
import { 
  SearchOutlined, 
  DownloadOutlined, 
  StarOutlined, 
  FilterOutlined,
  AppstoreOutlined,
  UserOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { McpServerPackage, MarketplaceFilters } from '../../types/marketplace';
import { ServerCard } from './ServerCard';

const { Option } = Select;

// Mock data for demonstration
const mockPackages: McpServerPackage[] = [
  {
    id: 'shrimp-task-manager',
    name: 'Shrimp Task Manager',
    description: '강력한 작업 관리 및 추적 시스템. 프로젝트별 작업 분리와 백업 기능을 제공합니다.',
    version: '1.2.0',
    author: 'UGOT Team',
    category: 'productivity',
    tags: ['task-management', 'productivity', 'collaboration'],
    downloadCount: 1250,
    rating: 4.8,
    ratingCount: 45,
    lastUpdated: '2024-01-15',
    config: {
      transport: 'sse',
      endpoint: 'https://mcp-shrimp.ugot.uk/sse',
      auth: { type: 'none' }
    },
    isInstalled: true,
    isOfficial: true,
    documentation: 'https://docs.ugot.uk/shrimp-task-manager'
  },
  {
    id: 'database-connector',
    name: 'Database Connector',
    description: '다양한 데이터베이스에 연결하여 데이터를 조회하고 관리할 수 있는 MCP 서버입니다.',
    version: '2.1.5',
    author: 'DB Solutions',
    category: 'database',
    tags: ['database', 'sql', 'connector'],
    downloadCount: 850,
    rating: 4.5,
    ratingCount: 32,
    lastUpdated: '2024-01-10',
    config: {
      transport: 'sse',
      endpoint: 'https://mcp-database.ugot.uk/sse',
      auth: { type: 'bearer' }
    },
    isInstalled: false,
    isOfficial: false
  },
  {
    id: 'file-manager',
    name: 'File Manager Pro',
    description: '파일 시스템 작업을 위한 포괄적인 도구 모음. 파일 업로드, 다운로드, 압축 등을 지원합니다.',
    version: '1.0.8',
    author: 'FileTools Inc',
    category: 'utilities',
    tags: ['files', 'utilities', 'management'],
    downloadCount: 620,
    rating: 4.2,
    ratingCount: 28,
    lastUpdated: '2024-01-08',
    config: {
      transport: 'websocket',
      endpoint: 'wss://mcp-files.example.com/ws',
      auth: { type: 'basic' }
    },
    isInstalled: false,
    isOfficial: false
  },
  {
    id: 'api-gateway',
    name: 'API Gateway',
    description: 'RESTful API 호출을 위한 게이트웨이 서버. 인증, 라우팅, 로드 밸런싱 기능을 제공합니다.',
    version: '3.0.2',
    author: 'API Team',
    category: 'integration',
    tags: ['api', 'gateway', 'integration'],
    downloadCount: 2100,
    rating: 4.9,
    ratingCount: 78,
    lastUpdated: '2024-01-12',
    config: {
      transport: 'sse',
      endpoint: 'https://mcp-api.example.com/sse',
      auth: { type: 'bearer' }
    },
    isInstalled: false,
    isOfficial: true
  }
];

const categories = [
  { label: '모든 카테고리', value: '' },
  { label: '생산성', value: 'productivity' },
  { label: '데이터베이스', value: 'database' },
  { label: '유틸리티', value: 'utilities' },
  { label: '통합', value: 'integration' }
];

const sortOptions = [
  { label: '이름순', value: 'name' },
  { label: '다운로드순', value: 'downloads' },
  { label: '평점순', value: 'rating' },
  { label: '업데이트순', value: 'updated' }
];

export const McpMarketplace: React.FC = () => {
  const [filters, setFilters] = useState<MarketplaceFilters>({
    search: '',
    category: '',
    sortBy: 'downloads',
    sortOrder: 'desc',
    showInstalled: false,
    showOfficial: false
  });
  const [loading, setLoading] = useState(false);

  const filteredPackages = useMemo(() => {
    let result = [...mockPackages];

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      result = result.filter(pkg => 
        pkg.name.toLowerCase().includes(searchTerm) ||
        pkg.description.toLowerCase().includes(searchTerm) ||
        pkg.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
        pkg.author.toLowerCase().includes(searchTerm)
      );
    }

    // Category filter
    if (filters.category) {
      result = result.filter(pkg => pkg.category === filters.category);
    }

    // Installation status filter
    if (filters.showInstalled) {
      result = result.filter(pkg => pkg.isInstalled);
    }

    // Official filter
    if (filters.showOfficial) {
      result = result.filter(pkg => pkg.isOfficial);
    }

    // Sort
    result.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (filters.sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'downloads':
          aValue = a.downloadCount;
          bValue = b.downloadCount;
          break;
        case 'rating':
          aValue = a.rating;
          bValue = b.rating;
          break;
        case 'updated':
          aValue = new Date(a.lastUpdated).getTime();
          bValue = new Date(b.lastUpdated).getTime();
          break;
        default:
          return 0;
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return result;
  }, [filters]);

  const handleFilterChange = (key: keyof MarketplaceFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleInstall = async (packageId: string) => {
    setLoading(true);
    try {
      // Mock installation process
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log(`Installing package: ${packageId}`);
      // In real implementation, this would call the MCP server installation API
    } catch (error) {
      console.error('Installation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async (packageId: string) => {
    setLoading(true);
    try {
      // Mock uninstallation process
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Uninstalling package: ${packageId}`);
    } catch (error) {
      console.error('Uninstallation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mcp-marketplace" style={{ padding: '24px', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>
          <AppstoreOutlined style={{ marginRight: '12px', color: '#3b82f6' }} />
          MCP 마켓플레이스
        </h1>
        <p style={{ color: '#6b7280', marginTop: '8px', fontSize: '16px' }}>
          다양한 MCP 서버를 탐색하고 설치하여 시스템 기능을 확장하세요
        </p>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="서버 검색..."
              prefix={<SearchOutlined />}
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="카테고리"
              value={filters.category}
              onChange={(value) => handleFilterChange('category', value)}
              style={{ width: '100%' }}
            >
              {categories.map(cat => (
                <Option key={cat.value} value={cat.value}>{cat.label}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="정렬"
              value={filters.sortBy}
              onChange={(value) => handleFilterChange('sortBy', value)}
              style={{ width: '100%' }}
            >
              {sortOptions.map(opt => (
                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Space>
              <Button
                type={filters.showInstalled ? 'primary' : 'default'}
                onClick={() => handleFilterChange('showInstalled', !filters.showInstalled)}
                size="small"
              >
                설치됨만
              </Button>
              <Button
                type={filters.showOfficial ? 'primary' : 'default'}
                onClick={() => handleFilterChange('showOfficial', !filters.showOfficial)}
                size="small"
              >
                공식만
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
                {filteredPackages.length}
              </div>
              <div style={{ color: '#6b7280' }}>검색 결과</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                {filteredPackages.filter(p => p.isInstalled).length}
              </div>
              <div style={{ color: '#6b7280' }}>설치됨</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>
                {filteredPackages.filter(p => p.isOfficial).length}
              </div>
              <div style={{ color: '#6b7280' }}>공식</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#8b5cf6' }}>
                {filteredPackages.reduce((sum, p) => sum + p.downloadCount, 0).toLocaleString()}
              </div>
              <div style={{ color: '#6b7280' }}>총 다운로드</div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Server Grid */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px', color: '#6b7280' }}>처리 중...</div>
        </div>
      )}

      {!loading && filteredPackages.length === 0 && (
        <Alert
          message="검색 결과가 없습니다"
          description="다른 검색어나 필터를 시도해보세요."
          type="info"
          showIcon
          style={{ margin: '40px 0' }}
        />
      )}

      {!loading && filteredPackages.length > 0 && (
        <Row gutter={[16, 16]}>
          {filteredPackages.map(pkg => (
            <Col key={pkg.id} xs={24} sm={12} lg={8} xl={6}>
              <ServerCard
                package={pkg}
                onInstall={() => handleInstall(pkg.id)}
                onUninstall={() => handleUninstall(pkg.id)}
                loading={loading}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};