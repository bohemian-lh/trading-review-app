import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileSpreadsheet, BarChart3, LayoutDashboard, Settings, TrendingUp, GitCompare, BookOpen, Brain, CheckSquare } from 'lucide-react';
import { cn } from '@/utils';

export const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '首页', icon: LayoutDashboard },
    { path: '/subsequent-profit', label: '后续盈亏', icon: TrendingUp },
    { path: '/theory-vs-actual', label: '理论vs实际', icon: GitCompare },
    { path: '/journal', label: '交易日志', icon: BookOpen },
    { path: '/mindset', label: '心态管理', icon: Brain },
    { path: '/decision-quality', label: '决策质量控制', icon: CheckSquare },
    { path: '/import', label: '导入/导出', icon: FileSpreadsheet },
    { path: '/editor', label: '数据编辑', icon: BarChart3 },
    { path: '/config', label: '字段配置', icon: Settings },
  ];

  return (
    <nav className="bg-gray-50 border-b">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex space-x-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center space-x-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
