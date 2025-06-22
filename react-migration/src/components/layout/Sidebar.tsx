import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  Bars3Icon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArchiveBoxIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useState } from 'react';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className = '' }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { createChat, getAllChats } = useChat();
  const { isMobile, showSidebar, toggleSidebar, setShowSidebar } = useResponsive();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [search, setSearch] = useState('');
  const sidebarRef = useRef<HTMLDivElement>(null);

  const recentChats = getAllChats().slice(0, 20);

  // 터치 제스처 핸들링
  useEffect(() => {
    let touchstart: Touch | null = null;
    let touchend: Touch | null = null;

    const checkDirection = () => {
      if (!touchstart || !touchend) return;
      
      const screenWidth = window.innerWidth;
      const swipeDistance = Math.abs(touchend.screenX - touchstart.screenX);
      
      if (touchstart.clientX < 40 && swipeDistance >= screenWidth / 8) {
        if (touchend.screenX < touchstart.screenX) {
          setShowSidebar(false);
        }
        if (touchend.screenX > touchstart.screenX) {
          setShowSidebar(true);
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchstart = e.changedTouches[0];
    };

    const onTouchEnd = (e: TouchEvent) => {
      touchend = e.changedTouches[0];
      checkDirection();
    };

    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [setShowSidebar]);

  const handleNewChat = async () => {
    const chatId = await createChat();
    navigate(`/c/${chatId}`);
    if (isMobile) {
      setShowSidebar(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleChatClick = () => {
    if (isMobile) {
      setShowSidebar(false);
    }
  };

  return (
    <>
      {/* 모바일 오버레이 */}
      {showSidebar && isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* 사이드바 */}
      <div
        ref={sidebarRef}
        className={`
          h-screen max-h-[100dvh] min-h-screen select-none
          ${showSidebar 
            ? 'md:relative w-[260px] max-w-[260px]' 
            : '-translate-x-[260px] w-0'
          }
          transition-all duration-200 ease-in-out
          shrink-0 bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-200 text-sm 
          fixed z-50 top-0 left-0 overflow-x-hidden
          ${className}
        `}
        data-state={showSidebar}
      >
        <div 
          className={`
            py-2 my-auto flex flex-col justify-between h-screen max-h-[100dvh] w-[260px] 
            overflow-x-hidden z-50
            ${showSidebar ? '' : 'invisible'}
          `}
        >
          {/* 헤더 */}
          <div className="px-1.5 flex justify-between space-x-1 text-gray-600 dark:text-gray-400">
            <button
              className="cursor-pointer p-[7px] flex rounded-xl hover:bg-gray-100 dark:hover:bg-gray-900 transition-all duration-200"
              onClick={toggleSidebar}
            >
              <div className="m-auto self-center">
                <Bars3Icon className="size-5" />
              </div>
            </button>

            <NavLink
              to="/"
              className="flex justify-between items-center flex-1 rounded-lg px-2 py-1 h-full text-right hover:bg-gray-100 dark:hover:bg-gray-900 transition-all duration-200 no-drag-region"
              onClick={handleNewChat}
            >
              <div className="flex items-center">
                <div className="self-center font-medium text-sm text-gray-850 dark:text-white font-primary">
                  New Chat
                </div>
              </div>
              <div>
                <PencilSquareIcon className="size-5" strokeWidth="2" />
              </div>
            </NavLink>
          </div>

          {/* 검색 */}
          <div className="relative px-1.5 mt-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 transition-all duration-200"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* 채팅 목록 */}
          <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden mt-2">
            {/* 특별 메뉴 */}
            <div className="px-2 mb-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 px-2">
                Features
              </div>
              <div className="flex flex-col space-y-1">
                <NavLink
                  to="/mcp"
                  onClick={handleChatClick}
                  className={({ isActive }) =>
                    `group w-full flex justify-between rounded-lg px-[11px] py-[6px] transition-all duration-200 whitespace-nowrap text-ellipsis ${
                      isActive
                        ? 'bg-gray-200 dark:bg-gray-900'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-950'
                    }`
                  }
                >
                  <div className="flex self-center flex-1 w-full">
                    <div className="text-left self-center overflow-hidden w-full h-[20px] truncate">
                      MCP Dashboard
                    </div>
                  </div>
                </NavLink>
                <NavLink
                  to="/copilot-mcp"
                  onClick={handleChatClick}
                  className={({ isActive }) =>
                    `group w-full flex justify-between rounded-lg px-[11px] py-[6px] transition-all duration-200 whitespace-nowrap text-ellipsis ${
                      isActive
                        ? 'bg-gray-200 dark:bg-gray-900'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-950'
                    }`
                  }
                >
                  <div className="flex self-center flex-1 w-full">
                    <div className="text-left self-center overflow-hidden w-full h-[20px] truncate">
                      CopilotKit + MCP Demo
                    </div>
                  </div>
                </NavLink>
              </div>
            </div>
            
            <div className="px-2 mt-0.5">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 px-2">
                Chats
              </div>
              
              <div className="flex flex-col space-y-1">
                {recentChats.length === 0 ? (
                  <div className="flex h-16 items-center justify-center">
                    <div className="text-xs text-gray-400 dark:text-gray-500">No recent chats</div>
                  </div>
                ) : (
                  recentChats.map((chat) => (
                    <NavLink
                      key={chat.id}
                      to={`/c/${chat.id}`}
                      onClick={handleChatClick}
                      className={({ isActive }) =>
                        `group w-full flex justify-between rounded-lg px-[11px] py-[6px] transition-all duration-200 whitespace-nowrap text-ellipsis ${
                          isActive
                            ? 'bg-gray-200 dark:bg-gray-900'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-950'
                        }`
                      }
                    >
                      <div className="flex self-center flex-1 w-full">
                        <div className="text-left self-center overflow-hidden w-full h-[20px] truncate">
                          {chat.title}
                        </div>
                      </div>
                      
                      {/* 채팅 메뉴 버튼 */}
                      <div className="flex items-center space-x-1.5 invisible group-hover:visible">
                        <button 
                          className="self-center dark:hover:text-white transition-all duration-200 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // 메뉴 열기 로직
                          }}
                        >
                          <EllipsisHorizontalIcon className="size-4" />
                        </button>
                      </div>
                    </NavLink>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 푸터 - 사용자 메뉴 */}
          <div className="relative px-2 pb-2">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex w-full items-center gap-2.5 rounded-lg p-2 text-sm text-gray-700 transition-all duration-200 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <div className="size-6 flex-shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {user?.name?.[0] || user?.email?.[0] || 'U'}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{user?.name || user?.email || 'Guest'}</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{user?.role || 'user'}</div>
              </div>
              <EllipsisHorizontalIcon className="size-4 flex-shrink-0" />
            </button>

            {/* 사용자 메뉴 드롭다운 */}
            {showUserMenu && (
              <div className="absolute bottom-full left-2 right-2 mb-2 rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:ring-gray-700 transform transition-all duration-200 ease-in-out animate-in fade-in slide-in-from-bottom-2">
                <div className="py-1">
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors duration-200">
                    <UserCircleIcon className="size-4" />
                    Profile
                  </button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors duration-200">
                    <Cog6ToothIcon className="size-4" />
                    Settings
                  </button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors duration-200">
                    <ArchiveBoxIcon className="size-4" />
                    Archived Chats
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700"></div>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700 transition-colors duration-200"
                  >
                    <ArrowRightOnRectangleIcon className="size-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}