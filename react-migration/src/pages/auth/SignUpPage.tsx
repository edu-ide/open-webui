import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button, Input, Card, CardBody, CardHeader } from '@heroui/react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

export default function SignUpPage() {
  const { signUp, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (formData.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    try {
      await signUp({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      const returnUrl = searchParams.get('returnUrl') || '/';
      navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.');
    }
  };

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const isFormValid = formData.name && formData.email && formData.password && 
                     formData.confirmPassword && formData.password === formData.confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-default-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">회원가입</h1>
            <p className="text-small text-default-500">새 계정을 만드세요</p>
          </div>
        </CardHeader>
        
        <CardBody className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              label="이름"
              placeholder="이름을 입력하세요"
              value={formData.name}
              onChange={handleInputChange('name')}
              isRequired
              variant="bordered"
              autoComplete="name"
            />

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
              placeholder="비밀번호를 입력하세요 (최소 6자)"
              value={formData.password}
              onChange={handleInputChange('password')}
              isRequired
              variant="bordered"
              autoComplete="new-password"
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

            <Input
              type={showConfirmPassword ? 'text' : 'password'}
              label="비밀번호 확인"
              placeholder="비밀번호를 다시 입력하세요"
              value={formData.confirmPassword}
              onChange={handleInputChange('confirmPassword')}
              isRequired
              variant="bordered"
              autoComplete="new-password"
              color={formData.confirmPassword && formData.password !== formData.confirmPassword ? 'danger' : 'default'}
              errorMessage={formData.confirmPassword && formData.password !== formData.confirmPassword ? '비밀번호가 일치하지 않습니다.' : ''}
              endContent={
                <button
                  className="focus:outline-none"
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label="toggle confirm password visibility"
                >
                  {showConfirmPassword ? (
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
              disabled={!isFormValid}
            >
              회원가입
            </Button>
          </form>

          <div className="text-center">
            <p className="text-small text-default-500">
              이미 계정이 있으신가요?{' '}
              <Link 
                to="/auth/signin" 
                className="text-primary hover:underline"
              >
                로그인
              </Link>
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}