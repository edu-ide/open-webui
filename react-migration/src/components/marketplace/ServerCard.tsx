import React, { useState } from 'react';
import { Card, Button, Tag, Rate, Avatar, Space, Tooltip, Badge, Modal, Descriptions } from 'antd';
import { 
  DownloadOutlined, 
  DeleteOutlined, 
  InfoCircleOutlined,
  StarOutlined,
  UserOutlined,
  CalendarOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { McpServerPackage } from '../../types/marketplace';

interface ServerCardProps {
  package: McpServerPackage;
  onInstall: () => void;
  onUninstall: () => void;
  loading?: boolean;
}

export const ServerCard: React.FC<ServerCardProps> = ({ 
  package: pkg, 
  onInstall, 
  onUninstall, 
  loading = false 
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'productivity': 'blue',
      'database': 'green',
      'utilities': 'orange',
      'integration': 'purple',
      'default': 'gray'
    };
    return colors[category] || colors.default;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return '1일 전';
    if (diffDays < 7) return `${diffDays}일 전`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)}주 전`;
    if (diffDays < 365) return `${Math.ceil(diffDays / 30)}개월 전`;
    return `${Math.ceil(diffDays / 365)}년 전`;
  };

  return (
    <>
      <Badge.Ribbon 
        text={pkg.isOfficial ? "공식" : undefined}
        color={pkg.isOfficial ? "gold" : undefined}
        style={{ display: pkg.isOfficial ? 'block' : 'none' }}
      >
        <Card
          hoverable
          style={{ 
            height: '320px',
            position: 'relative',
            border: pkg.isInstalled ? '2px solid #52c41a' : undefined
          }}
          bodyStyle={{ 
            padding: '16px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
          actions={[
            <Tooltip title="상세 정보">
              <Button 
                type="text" 
                icon={<InfoCircleOutlined />}
                onClick={() => setShowDetails(true)}
              />
            </Tooltip>,
            pkg.isInstalled ? (
              <Tooltip title="제거">
                <Button 
                  type="text" 
                  danger
                  icon={<DeleteOutlined />}
                  onClick={onUninstall}
                  loading={loading}
                />
              </Tooltip>
            ) : (
              <Tooltip title="설치">
                <Button 
                  type="text" 
                  icon={<DownloadOutlined />}
                  onClick={onInstall}
                  loading={loading}
                />
              </Tooltip>
            ),
            pkg.repository && (
              <Tooltip title="저장소">
                <Button 
                  type="text" 
                  icon={<LinkOutlined />}
                  onClick={() => window.open(pkg.repository, '_blank')}
                />
              </Tooltip>
            )
          ].filter(Boolean)}
        >
          {/* Header */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <Avatar 
                size={40}
                icon={<UserOutlined />}
                style={{ marginRight: '12px', backgroundColor: getCategoryColor(pkg.category) }}
              >
                {pkg.name.substring(0, 2).toUpperCase()}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '16px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {pkg.name}
                  {pkg.isInstalled && (
                    <CheckCircleOutlined 
                      style={{ 
                        color: '#52c41a', 
                        marginLeft: '8px',
                        fontSize: '14px'
                      }} 
                    />
                  )}
                </div>
                <div style={{ 
                  color: '#6b7280', 
                  fontSize: '12px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  v{pkg.version} by {pkg.author}
                </div>
              </div>
            </div>

            <Tag color={getCategoryColor(pkg.category)} style={{ marginBottom: '8px' }}>
              {pkg.category}
            </Tag>
          </div>

          {/* Description */}
          <div style={{ 
            flex: 1,
            marginBottom: '12px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            fontSize: '14px',
            color: '#4b5563',
            lineHeight: '1.4'
          }}>
            {pkg.description}
          </div>

          {/* Tags */}
          <div style={{ marginBottom: '12px', minHeight: '24px' }}>
            {pkg.tags.slice(0, 3).map(tag => (
              <Tag key={tag} size="small" style={{ marginBottom: '4px' }}>
                {tag}
              </Tag>
            ))}
            {pkg.tags.length > 3 && (
              <Tag size="small" style={{ marginBottom: '4px' }}>
                +{pkg.tags.length - 3}
              </Tag>
            )}
          </div>

          {/* Stats */}
          <div style={{ marginTop: 'auto' }}>
            <Space size="small" style={{ width: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <StarOutlined style={{ color: '#faad14', marginRight: '4px' }} />
                <span style={{ fontSize: '12px' }}>
                  {pkg.rating.toFixed(1)} ({pkg.ratingCount})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <DownloadOutlined style={{ color: '#1890ff', marginRight: '4px' }} />
                <span style={{ fontSize: '12px' }}>
                  {formatNumber(pkg.downloadCount)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CalendarOutlined style={{ color: '#52c41a', marginRight: '4px' }} />
                <span style={{ fontSize: '12px' }}>
                  {formatDate(pkg.lastUpdated)}
                </span>
              </div>
            </Space>
          </div>
        </Card>
      </Badge.Ribbon>

      {/* Details Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Avatar 
              size={32}
              icon={<UserOutlined />}
              style={{ marginRight: '12px', backgroundColor: getCategoryColor(pkg.category) }}
            >
              {pkg.name.substring(0, 2).toUpperCase()}
            </Avatar>
            {pkg.name}
            {pkg.isOfficial && (
              <SafetyCertificateOutlined 
                style={{ color: '#faad14', marginLeft: '8px' }} 
              />
            )}
          </div>
        }
        open={showDetails}
        onCancel={() => setShowDetails(false)}
        footer={[
          <Button key="close" onClick={() => setShowDetails(false)}>
            닫기
          </Button>,
          pkg.repository && (
            <Button 
              key="repo" 
              icon={<LinkOutlined />}
              onClick={() => window.open(pkg.repository, '_blank')}
            >
              저장소
            </Button>
          ),
          pkg.documentation && (
            <Button 
              key="docs" 
              icon={<InfoCircleOutlined />}
              onClick={() => window.open(pkg.documentation, '_blank')}
            >
              문서
            </Button>
          ),
          pkg.isInstalled ? (
            <Button 
              key="uninstall" 
              type="primary" 
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                onUninstall();
                setShowDetails(false);
              }}
              loading={loading}
            >
              제거
            </Button>
          ) : (
            <Button 
              key="install" 
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => {
                onInstall();
                setShowDetails(false);
              }}
              loading={loading}
            >
              설치
            </Button>
          )
        ].filter(Boolean)}
        width={600}
      >
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="버전">{pkg.version}</Descriptions.Item>
          <Descriptions.Item label="작성자">{pkg.author}</Descriptions.Item>
          <Descriptions.Item label="카테고리">{pkg.category}</Descriptions.Item>
          <Descriptions.Item label="다운로드">{pkg.downloadCount.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="평점">
            <Rate disabled value={pkg.rating} allowHalf style={{ fontSize: '12px' }} />
            <span style={{ marginLeft: '8px' }}>
              {pkg.rating.toFixed(1)} ({pkg.ratingCount}개 리뷰)
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="마지막 업데이트">{pkg.lastUpdated}</Descriptions.Item>
          <Descriptions.Item label="전송 방식" span={2}>
            <Tag>{pkg.config.transport.toUpperCase()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="엔드포인트" span={2}>
            <code style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '2px 4px' }}>
              {pkg.config.endpoint}
            </code>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: '16px' }}>
          <h4>설명</h4>
          <p style={{ color: '#4b5563', lineHeight: '1.6' }}>
            {pkg.description}
          </p>
        </div>

        <div style={{ marginTop: '16px' }}>
          <h4>태그</h4>
          <div>
            {pkg.tags.map(tag => (
              <Tag key={tag} style={{ marginBottom: '4px' }}>
                {tag}
              </Tag>
            ))}
          </div>
        </div>

        {pkg.examples && pkg.examples.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4>예제</h4>
            <ul>
              {pkg.examples.map((example, index) => (
                <li key={index} style={{ marginBottom: '4px', color: '#4b5563' }}>
                  {example}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
};