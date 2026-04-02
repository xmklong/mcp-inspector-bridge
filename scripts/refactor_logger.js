const fs = require('fs');
const path = require('path');

const probeDir = path.join(__dirname, '../src/probe');

const processFile = (filename) => {
    const filePath = path.join(probeDir, filename);
    let original = fs.readFileSync(filePath, 'utf-8');
    let content = original;

    // Add Logger import if not present
    if (!content.includes("import { Logger } from './logger'")) {
        // Find a place to inject. Usually after // @ts-nocheck
        if (content.startsWith('// @ts-nocheck')) {
            content = content.replace('// @ts-nocheck', "// @ts-nocheck\nimport { Logger } from './logger';");
        } else {
            content = "import { Logger } from './logger';\n" + content;
        }
    }

    // picker.ts specific fixes
    if (filename === 'picker.ts') {
        content = content.replace(/hitTest: function \(clientX, clientY, isDebug\) \{/g, 'hitTest: function (clientX, clientY) {');
        content = content.replace(/const hitNode = self\.hitTest\(e\.clientX, e\.clientY, true\);.*?/g, 'const hitNode = self.hitTest(e.clientX, e.clientY);');
        // change if (isDebug) console.log to Logger.log
        content = content.replace(/if\s*\(isDebug\)\s*console\.log/g, 'Logger.log');
    }

    // General replacements
    content = content.replace(/console\.log/g, 'Logger.log');
    content = content.replace(/console\.debug/g, 'Logger.debug');
    
    // Replace typical warnings with Logger.warn
    // E.g., highlighter's warnings about missing window.cc or missing Scene.
    // crawler's missing component warnings.
    // render-debugger's missing component warnings.
    if (filename === 'highlighter.ts' || filename === 'crawler.ts' || filename === 'render-debugger.ts' || filename === 'index.ts') {
        content = content.replace(/console\.warn\(\'[\[]?Highlighter[\]]?/g, "Logger.warn('[Highlighter]");
        content = content.replace(/console\.warn\(\`[\[]?Highlighter[\]]?/g, "Logger.warn(`[Highlighter]");

        content = content.replace(/console\.warn\(\"[\[]?MCP Crawler[\]]?/g, "Logger.warn(\"[MCP Crawler]");

        content = content.replace(/console\.warn\(\"[\[]?RenderDebugger[\]]?/g, "Logger.warn(\"[RenderDebugger]");
        content = content.replace(/console\.warn\(\`[\[]?RenderDebugger[\]]?/g, "Logger.warn(`[RenderDebugger]");

        if (filename === 'index.ts') {
            content = content.replace(/console\.log\(/g, 'Logger.log('); 
        }
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Refactored ${filename}`);
    }
};

['picker.ts', 'highlighter.ts', 'crawler.ts', 'render-debugger.ts', 'index.ts'].forEach(processFile);
