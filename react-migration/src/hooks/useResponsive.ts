import { useState, useEffect } from 'react';

const BREAKPOINT = 768;

export function useResponsive() {
  const [isMobile, setIsMobile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < BREAKPOINT;
      setIsMobile(mobile);
      
      // 모바일에서는 사이드바 숨김, 데스크톱에서는 표시
      if (mobile) {
        setShowSidebar(false);
      } else {
        // 데스크톱에서는 localStorage에서 사이드바 상태 복원
        const savedState = localStorage.getItem('sidebar');
        setShowSidebar(savedState === 'true' || savedState === null);
      }
    };

    // 초기 설정
    checkMobile();

    // 리사이즈 이벤트 리스너
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const toggleSidebar = () => {
    setShowSidebar(prev => {
      const newState = !prev;
      if (!isMobile) {
        localStorage.setItem('sidebar', newState.toString());
      }
      return newState;
    });
  };

  return {
    isMobile,
    showSidebar,
    toggleSidebar,
    setShowSidebar
  };
}