import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  teacherName?: string;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, teacherName, onLogout }) => {
  return (
    <div className="min-h-screen flex flex-col items-center bg-purple-50">
      <header className="w-full bg-white shadow-sm border-b border-purple-100 p-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-purple-900 tracking-tight">
            Gate<span className="text-purple-600">Keeper</span>
          </h1>
          {teacherName && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {teacherName}
              </span>
              <button 
                onClick={onLogout}
                className="text-xs text-purple-600 hover:text-purple-800 font-semibold underline"
              >
                Exit
              </button>
            </div>
          )}
        </div>
      </header>
      
      <main className="flex-1 w-full max-w-md p-6 flex flex-col justify-center">
        {title && (
          <h2 className="text-2xl font-light text-slate-800 mb-8 text-center">
            {title}
          </h2>
        )}
        {children}
      </main>

      <footer className="w-full p-4 text-center text-slate-400 text-xs">
        System active • Secure connection
      </footer>
    </div>
  );
};