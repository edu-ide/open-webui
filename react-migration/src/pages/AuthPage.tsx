import { Card, CardHeader, CardBody, Input, Button, Tabs, Tab } from '@heroui/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSignIn, useSignUp } from '../hooks/useApi';

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/';
  
  const [selected, setSelected] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const signInMutation = useSignIn();
  const signUpMutation = useSignUp();

  const handleSignIn = () => {
    signInMutation.mutate(
      { email, password },
      {
        onSuccess: () => {
          navigate(returnUrl);
        }
      }
    );
  };

  const handleSignUp = () => {
    signUpMutation.mutate(
      { email, password, name, profile_image_url: '' },
      {
        onSuccess: () => {
          navigate(returnUrl);
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col gap-3 p-6">
          <h1 className="text-2xl font-bold text-center">Open WebUI</h1>
          <p className="text-sm text-gray-600 text-center">
            Sign in to continue to your workspace
          </p>
        </CardHeader>
        <CardBody className="px-6 pb-6">
          <Tabs 
            selectedKey={selected}
            onSelectionChange={(key) => setSelected(key as string)}
            fullWidth
          >
            <Tab key="login" title="Login">
              <form onSubmit={(e) => { e.preventDefault(); handleSignIn(); }} className="space-y-4 mt-4">
                <Input
                  type="email"
                  label="Email"
                  placeholder="Enter your email"
                  value={email}
                  onValueChange={setEmail}
                  required
                />
                <Input
                  type="password"
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onValueChange={setPassword}
                  required
                />
                <Button
                  fullWidth
                  color="primary"
                  type="submit"
                  isLoading={signInMutation.isPending}
                >
                  Sign In
                </Button>
              </form>
            </Tab>
            <Tab key="signup" title="Sign Up">
              <form onSubmit={(e) => { e.preventDefault(); handleSignUp(); }} className="space-y-4 mt-4">
                <Input
                  label="Name"
                  placeholder="Enter your name"
                  value={name}
                  onValueChange={setName}
                  required
                />
                <Input
                  type="email"
                  label="Email"
                  placeholder="Enter your email"
                  value={email}
                  onValueChange={setEmail}
                  required
                />
                <Input
                  type="password"
                  label="Password"
                  placeholder="Create a password"
                  value={password}
                  onValueChange={setPassword}
                  required
                />
                <Button
                  fullWidth
                  color="primary"
                  type="submit"
                  isLoading={signUpMutation.isPending}
                >
                  Create Account
                </Button>
              </form>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
}