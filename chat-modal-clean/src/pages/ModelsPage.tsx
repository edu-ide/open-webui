import React from 'react';
import { Card, CardHeader, CardBody, Button, Chip, Switch } from '@heroui/react';
import { Brain, Download, Settings } from 'lucide-react';

const ModelsPage: React.FC = () => {
  const models = [
    {
      id: 'llama2',
      name: 'Llama 2 7B',
      description: 'Meta의 대화형 AI 모델',
      status: 'active',
      size: '3.8GB',
      downloaded: true
    },
    {
      id: 'codellama',
      name: 'Code Llama',
      description: '코드 생성 특화 모델',
      status: 'inactive',
      size: '7.2GB',
      downloaded: true
    },
    {
      id: 'mistral',
      name: 'Mistral 7B',
      description: '효율적인 추론 모델',
      status: 'inactive',
      size: '4.1GB',
      downloaded: false
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Models</h1>
          <p className="text-default-500">AI 모델을 관리하고 설정합니다</p>
        </div>
        <Button color="primary" startContent={<Download size={18} />}>
          새 모델 다운로드
        </Button>
      </div>

      <div className="grid gap-4">
        {models.map((model) => (
          <Card key={model.id} className="p-2">
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Brain className="text-primary" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">{model.name}</h3>
                  <p className="text-sm text-default-500">{model.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Chip
                  color={model.status === 'active' ? 'success' : 'default'}
                  variant="flat"
                  size="sm"
                >
                  {model.status === 'active' ? '활성' : '비활성'}
                </Chip>
                <Chip variant="bordered" size="sm">
                  {model.size}
                </Chip>
              </div>
            </CardHeader>
            <CardBody className="pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-default-600">활성화</span>
                    <Switch isSelected={model.status === 'active'} size="sm" />
                  </div>
                  {!model.downloaded && (
                    <Button size="sm" variant="flat" color="primary">
                      다운로드
                    </Button>
                  )}
                </div>
                <Button
                  isIconOnly
                  variant="flat"
                  size="sm"
                  startContent={<Settings size={16} />}
                >
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ModelsPage;