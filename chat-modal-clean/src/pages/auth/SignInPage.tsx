import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button, Input, Card, CardBody, CardHeader } from '@heroui/react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

export default function SignInPage() {
  const { signIn, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const returnUrl = searchParams.get('returnUrl') || '/';
      navigate(returnUrl, { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await signIn(formData);
      const returnUrl = searchParams.get('returnUrl') || '/';
      navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    }
  };

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-default-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">로그인</h1>
            <p className="text-small text-default-500">계정에 로그인하세요</p>
          </div>
        </CardHeader>
        
        <CardBody className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              label="이메일"
              placeholder="your@email.com"
              value={formData.email}
              onChange={handleInputChange('email')}
              isRequired
              variant="bordered"
              autoComplete="email"
            />
            
            <Input
              type={showPassword ? 'text' : 'password'}
              label="비밀번호"
              placeholder="비밀번호를 입력하세요"
              value={formData.password}
              onChange={handleInputChange('password')}
              isRequired
              variant="bordered"
              autoComplete="current-password"
              endContent={
                <button
                  className="focus:outline-none"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="toggle password visibility"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-default-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-default-400" />
                  )}
                </button>
              }
            />

            {error && (
              <div className="bg-danger-50 border border-danger-200 text-danger-800 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <Button
              type="submit"
              color="primary"
              size="lg"
              className="w-full"
              isLoading={isLoading}
              disabled={!formData.email || !formData.password}
            >
              로그인
            </Button>
          </form>

          <div className="text-center space-y-2">
            <p className="text-small text-default-500">
              계정이 없으신가요?{' '}
              <Link 
                to="/auth/signup" 
                className="text-primary hover:underline"
              >
                회원가입
              </Link>
            </p>
            
            <Link 
              to="/auth/forgot-password" 
              className="text-small text-default-500 hover:text-primary hover:underline block"
            >
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}