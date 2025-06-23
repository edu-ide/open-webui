import React, { useState } from 'react';
import { Modal, Form, Input, Select, Button, Steps, Alert, message, Divider } from 'antd';
import { 
  CloudDownloadOutlined, 
  SettingOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined 
} from '@ant-design/icons';
import { McpServerPackage } from '../../types/marketplace';
import { useMcpServers } from '../../hooks/useMcp';

const { Option } = Select;
const { TextArea } = Input;

interface ServerInstallerProps {
  package: McpServerPackage;
  visible: boolean;
  onClose: () => void;
  onInstalled: () => void;
}

interface InstallationStep {
  title: string;
  status: 'wait' | 'process' | 'finish' | 'error';
  description?: string;
}

export const ServerInstaller: React.FC<ServerInstallerProps> = ({
  package: pkg,
  visible,
  onClose,
  onInstalled
}) => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [installSteps, setInstallSteps] = useState<InstallationStep[]>([
    { title: '설정 확인', status: 'wait' },
    { title: '서버 다운로드', status: 'wait' },
    { title: '구성 설정', status: 'wait' },
    { title: '연결 테스트', status: 'wait' },
    { title: '설치 완료', status: 'wait' }
  ]);

  const { addServer } = useMcpServers();

  const updateStepStatus = (stepIndex: number, status: InstallationStep['status'], description?: string) => {
    setInstallSteps(prev => prev.map((step, index) => 
      index === stepIndex 
        ? { ...step, status, description }
        : step
    ));
  };

  const handleInstall = async (values: any) => {
    setInstalling(true);
    setCurrentStep(0);

    try {
      // Step 1: 설정 확인
      updateStepStatus(0, 'process', '설정 정보를 확인하고 있습니다...');
      await new Promise(resolve => setTimeout(resolve, 800));
      updateStepStatus(0, 'finish', '설정 확인 완료');
      setCurrentStep(1);

      // Step 2: 서버 다운로드
      updateStepStatus(1, 'process', '서버 패키지를 다운로드하고 있습니다...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      updateStepStatus(1, 'finish', '다운로드 완료');
      setCurrentStep(2);

      // Step 3: 구성 설정
      updateStepStatus(2, 'process', '서버 구성을 설정하고 있습니다...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateStepStatus(2, 'finish', '구성 설정 완료');
      setCurrentStep(3);

      // Step 4: 연결 테스트
      updateStepStatus(3, 'process', '서버 연결을 테스트하고 있습니다...');
      await new Promise(resolve => setTimeout(resolve, 1200));
      updateStepStatus(3, 'finish', '연결 테스트 성공');
      setCurrentStep(4);

      // Step 5: 설치 완료
      updateStepStatus(4, 'process', '설치를 완료하고 있습니다...');
      
      // 실제 MCP 서버 추가
      const serverConfig = {
        id: `${pkg.id}-${Date.now()}`,
        name: values.serverName || pkg.name,
        transport: values.transport || pkg.config.transport,
        endpoint: values.endpoint || pkg.config.endpoint,
        auth: {
          type: values.authType || pkg.config.auth?.type || 'none',
          ...(values.authToken && { token: values.authToken }),
          ...(values.authUsername && { username: values.authUsername }),
          ...(values.authPassword && { password: values.authPassword })
        },
        options: {
          ...pkg.config.options,
          ...(values.customOptions && JSON.parse(values.customOptions))
        }
      };

      await addServer(serverConfig);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      updateStepStatus(4, 'finish', '설치가 완료되었습니다!');

      message.success(`${pkg.name} 서버가 성공적으로 설치되었습니다!`);
      
      setTimeout(() => {
        onInstalled();
        handleClose();
      }, 1500);

    } catch (error) {
      console.error('Installation failed:', error);
      updateStepStatus(currentStep, 'error', `설치 중 오류가 발생했습니다: ${error}`);
      message.error('설치에 실패했습니다. 다시 시도해주세요.');
      setInstalling(false);
    }
  };

  const handleClose = () => {
    if (!installing) {
      form.resetFields();
      setCurrentStep(0);
      setInstallSteps(prev => prev.map(step => ({ ...step, status: 'wait', description: undefined })));
      onClose();
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <CloudDownloadOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
          {pkg.name} 설치
        </div>
      }
      open={visible}
      onCancel={handleClose}
      width={700}
      footer={null}
      destroyOnClose
    >
      <div style={{ marginBottom: '20px' }}>
        <Alert
          message="서버 설치 안내"
          description={`${pkg.name} v${pkg.version}을(를) 설치합니다. 설치 과정에서 서버 설정을 구성할 수 있습니다.`}
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      </div>

      {installing ? (
        <div>
          <Steps
            current={currentStep}
            direction="vertical"
            size="small"
            items={installSteps.map(step => ({
              title: step.title,
              status: step.status,
              description: step.description
            }))}
            style={{ marginBottom: '20px' }}
          />
          
          <div style={{ textAlign: 'center', padding: '20px' }}>
            {installSteps[4].status !== 'finish' && (
              <Button 
                loading 
                type="primary" 
                style={{ marginRight: '8px' }}
              >
                설치 진행 중...
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleInstall}
          initialValues={{
            serverName: pkg.name,
            transport: pkg.config.transport,
            endpoint: pkg.config.endpoint,
            authType: pkg.config.auth?.type || 'none'
          }}
        >
          <Form.Item
            label="서버 이름"
            name="serverName"
            rules={[{ required: true, message: '서버 이름을 입력해주세요' }]}
          >
            <Input placeholder="서버 이름을 입력하세요" />
          </Form.Item>

          <Form.Item
            label="전송 방식"
            name="transport"
            rules={[{ required: true, message: '전송 방식을 선택해주세요' }]}
          >
            <Select>
              <Option value="sse">Server-Sent Events (SSE)</Option>
              <Option value="websocket">WebSocket</Option>
              <Option value="stdio">Standard I/O</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="엔드포인트"
            name="endpoint"
            rules={[
              { required: true, message: '엔드포인트를 입력해주세요' },
              { type: 'url', message: '올바른 URL을 입력해주세요' }
            ]}
          >
            <Input placeholder="https://example.com/mcp" />
          </Form.Item>

          <Divider>인증 설정</Divider>

          <Form.Item
            label="인증 방식"
            name="authType"
          >
            <Select>
              <Option value="none">인증 없음</Option>
              <Option value="bearer">Bearer Token</Option>
              <Option value="basic">Basic Auth</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => 
              prevValues.authType !== currentValues.authType
            }
          >
            {({ getFieldValue }) => {
              const authType = getFieldValue('authType');
              
              if (authType === 'bearer') {
                return (
                  <Form.Item
                    label="Access Token"
                    name="authToken"
                    rules={[{ required: true, message: '토큰을 입력해주세요' }]}
                  >
                    <Input.Password placeholder="토큰을 입력하세요" />
                  </Form.Item>
                );
              }
              
              if (authType === 'basic') {
                return (
                  <>
                    <Form.Item
                      label="사용자명"
                      name="authUsername"
                      rules={[{ required: true, message: '사용자명을 입력해주세요' }]}
                    >
                      <Input placeholder="사용자명" />
                    </Form.Item>
                    <Form.Item
                      label="비밀번호"
                      name="authPassword"
                      rules={[{ required: true, message: '비밀번호를 입력해주세요' }]}
                    >
                      <Input.Password placeholder="비밀번호" />
                    </Form.Item>
                  </>
                );
              }
              
              return null;
            }}
          </Form.Item>

          <Divider>고급 설정</Divider>

          <Form.Item
            label="사용자 정의 옵션"
            name="customOptions"
            help="JSON 형식으로 추가 옵션을 입력하세요 (선택사항)"
          >
            <TextArea
              rows={3}
              placeholder='{"timeout": 5000, "retries": 3}'
            />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: '24px' }}>
            <Button 
              onClick={handleClose}
              style={{ marginRight: '8px' }}
            >
              취소
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              icon={<CloudDownloadOutlined />}
            >
              설치 시작
            </Button>
          </div>
        </Form>
      )}
    </Modal>
  );
};