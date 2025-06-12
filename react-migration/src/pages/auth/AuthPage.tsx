import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, Input, Button, Tabs, Tab } from '@heroui/react';
import { Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  
  const redirectPath = searchParams.get('redirect') || '/';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await signIn({ email: formData.email, password: formData.password });
      toast.success('로그인 성공!');
      navigate(redirectPath);
    } catch (error) {
      toast.error('로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await signUp({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });
      toast.success('회원가입 성공! 로그인되었습니다.');
      navigate(redirectPath);
    } catch (error) {
      toast.error('회원가입에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">OW</span>
          </div>
          <h1 className="text-2xl font-bold">Open-WebUI</h1>
          <p className="text-default-500">AI 채팅 플랫폼에 오신 것을 환영합니다</p>
        </CardHeader>
        
        <CardBody>
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key as string)}
            fullWidth
            color="primary"
          >
            <Tab key="signin" title="로그인">
              <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                <Input
                  type="email"
                  label="이메일"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  startContent={<Mail size={18} className="text-default-400" />}
                  isRequired
                />
                
                <Input
                  type="password"
                  label="비밀번호"
                  placeholder="비밀번호를 입력하세요"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  startContent={<Lock size={18} className="text-default-400" />}
                  isRequired
                />
                
                <Button
                  type="submit"
                  color="primary"
                  fullWidth
                  isLoading={isLoading}
                  size="lg"
                >
                  로그인
                </Button>
                
                <div className="text-center text-sm text-default-500">
                  <p>테스트 계정: admin@test.com / user@test.com</p>
                  <p>비밀번호: 아무거나</p>
                </div>
              </form>
            </Tab>
            
            <Tab key="signup" title="회원가입">
              <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                <Input
                  type="text"
                  label="이름"
                  placeholder="이름을 입력하세요"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  startContent={<User size={18} className="text-default-400" />}
                  isRequired
                />
                
                <Input
                  type="email"
                  label="이메일"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  startContent={<Mail size={18} className="text-default-400" />}
                  isRequired
                />
                
                <Input
                  type="password"
                  label="비밀번호"
                  placeholder="비밀번호를 입력하세요"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  startContent={<Lock size={18} className="text-default-400" />}
                  isRequired
                />
                
                <Input
                  type="password"
                  label="비밀번호 확인"
                  placeholder="비밀번호를 다시 입력하세요"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  startContent={<Lock size={18} className="text-default-400" />}
                  isRequired
                />
                
                <Button
                  type="submit"
                  color="primary"
                  fullWidth
                  isLoading={isLoading}
                  size="lg"
                >
                  회원가입
                </Button>
              </form>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
};

export default AuthPage;