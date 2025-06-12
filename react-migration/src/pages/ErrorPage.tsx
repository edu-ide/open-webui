import { Card, CardBody, Button } from '@heroui/react';
import { useRouteError, useNavigate } from 'react-router-dom';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function ErrorPage() {
  const error = useRouteError() as Error;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="max-w-md w-full">
        <CardBody className="text-center py-10">
          <ExclamationTriangleIcon className="w-16 h-16 mx-auto text-danger mb-4" />
          <h1 className="text-2xl font-bold mb-2">Oops! Something went wrong</h1>
          <p className="text-gray-600 mb-6">
            {error?.message || 'An unexpected error occurred'}
          </p>
          <Button 
            color="primary"
            onPress={() => navigate('/')}
          >
            Go Home
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}