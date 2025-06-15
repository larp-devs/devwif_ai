import React from 'react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-mono">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-orange-500 rounded-sm flex items-center justify-center">
                <span className="text-white font-bold text-sm">Y</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">devwif.ai</h1>
            </div>
            <nav className="flex items-center space-x-6 text-sm">
              <a href="#features" className="text-gray-600 hover:text-gray-900">features</a>
              <a href="#install" className="text-gray-600 hover:text-gray-900">install</a>
              <a href="https://github.com/apps/devwif" className="bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">
                install app
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            <span className="text-orange-500">devwifAI</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            AI-powered GitHub assistant for developers. Code reviews, implementation, and interactive development.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://github.com/apps/devwif" 
              className="inline-flex items-center px-6 py-3 bg-orange-500 text-white font-semibold rounded hover:bg-orange-600 transition-colors"
            >
              → Install GitHub App
            </a>
            <a 
              href="#features" 
              className="inline-flex items-center px-6 py-3 bg-white text-gray-700 font-semibold rounded border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Learn more
            </a>
          </div>
        </div>

        {/* Quick Demo */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Quick Start:</h3>
          <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm overflow-x-auto">
            <div className="space-y-2">
              <div><span className="text-gray-500"># Install the GitHub app</span></div>
              <div><span className="text-orange-400">$</span> visit https://github.com/apps/devwif</div>
              <div className="pt-2"><span className="text-gray-500"># Use in any repository</span></div>
              <div><span className="text-orange-400">$</span> @devwif review this PR</div>
              <div><span className="text-orange-400">$</span> @devwif implement user authentication</div>
              <div><span className="text-orange-400">$</span> @devwif plan database migration</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Features
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Interactive Code Assistant */}
            <div className="bg-gray-50 border border-gray-200 p-6 rounded">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🤖 Interactive Assistant</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Ask questions about code, architecture, and programming. Get intelligent responses about your codebase.
              </p>
            </div>

            {/* Code Review */}
            <div className="bg-gray-50 border border-gray-200 p-6 rounded">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🔍 Code Review</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Analyzes PR changes and suggests improvements, best practices, and potential issues.
              </p>
            </div>

            {/* Code Implementation */}
            <div className="bg-gray-50 border border-gray-200 p-6 rounded">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">✨ Implementation</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Implements fixes, refactoring, and new features directly in your repository.
              </p>
            </div>

            {/* PR/Issue Integration */}
            <div className="bg-gray-50 border border-gray-200 p-6 rounded">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">💬 GitHub Integration</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Works seamlessly with GitHub comments and PR reviews for natural collaboration.
              </p>
            </div>

            {/* Tool Access */}
            <div className="bg-gray-50 border border-gray-200 p-6 rounded">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🛠️ Tool Access</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Access to GitHub APIs and file operations. Additional tools via configuration.
              </p>
            </div>

            {/* Progress Tracking */}
            <div className="bg-gray-50 border border-gray-200 p-6 rounded">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">📋 Progress Tracking</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Visual progress indicators that update as devwifAI completes tasks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Usage Examples */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          Usage Examples
        </h2>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-white border border-gray-200 rounded p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Code Review</h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm mb-4">
              <div className="text-gray-400"># In a PR comment:</div>
              <div>@devwif review this implementation</div>
              <div>and suggest performance improvements</div>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Analyzes code changes</li>
              <li>• Identifies performance bottlenecks</li>
              <li>• Suggests optimizations</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Implementation</h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm mb-4">
              <div className="text-gray-400"># In an issue comment:</div>
              <div>@devwif implement a loading spinner</div>
              <div>component with TypeScript</div>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Creates new component file</li>
              <li>• Adds TypeScript definitions</li>
              <li>• Creates pull request</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Installation */}
      <section id="install" className="bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            Get Started
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-orange-600">1</span>
              </div>
              <h3 className="font-semibold mb-2">Install</h3>
              <p className="text-gray-600 text-sm">Install the devwifAI GitHub App</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-orange-600">2</span>
              </div>
              <h3 className="font-semibold mb-2">Mention</h3>
              <p className="text-gray-600 text-sm">Mention @devwif in any issue or PR</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-orange-600">3</span>
              </div>
              <h3 className="font-semibold mb-2">Collaborate</h3>
              <p className="text-gray-600 text-sm">Watch devwifAI assist with development</p>
            </div>
          </div>
          
          <a 
            href="https://github.com/apps/devwif" 
            className="inline-flex items-center px-8 py-4 bg-orange-500 text-white font-semibold rounded hover:bg-orange-600 transition-colors text-lg"
          >
            → Install devwifAI Now
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-semibold mb-3 text-gray-900">devwifAI</h3>
              <p className="text-gray-600 text-sm">
                AI-powered GitHub assistant for modern development workflows
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-gray-900">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="https://github.com/larp-devs/devwif_ai" className="hover:text-gray-900">Documentation</a></li>
                <li><a href="https://github.com/larp-devs/devwif_ai/issues" className="hover:text-gray-900">Support</a></li>
                <li><a href="https://github.com/apps/devwif" className="hover:text-gray-900">GitHub App</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-gray-900">Connect</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="https://github.com/larp-devs/devwif_ai" className="hover:text-gray-900">Repository</a></li>
                <li><a href="https://devwif.ai" className="hover:text-gray-900">Website</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 mt-8 pt-8 text-center text-gray-600 text-sm">
            <p>&copy; 2024 devwifAI. AI-powered GitHub assistant.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
