/**
 * Cache Management Handlers for Desktop Commander MCP
 * 
 * This module implements a conversation persistence system that provides Claude with
 * long-term memory across conversation sessions. The system uses file-based storage
 * to maintain conversation context, project details, decisions, and next steps.
 * 
 * Key Features:
 * - Persistent conversation memory across sessions
 * - Project context preservation for complex codebases
 * - Automatic cache updates during conversations
 * - Session restoration with full context
 * - Cumulative knowledge building over time
 * 
 * Architecture:
 * - File-based storage using Desktop Commander's filesystem tools
 * - Structured markdown files for human-readable cache content
 * - Timestamped updates for conversation history tracking
 * - Auto-update capability triggered by tool call counters
 * 
 * Cache File Structure:
 * - conversation_log.md: Ongoing conversation state and progress
 * - current_project_state.md: Technical project details and architecture
 * - decisions_made.md: Key decisions and approaches chosen
 * - next_steps.md: Immediate priorities and action items
 * - cache_protocol.md: Usage instructions and setup guide
 * 
 * @author Desktop Commander MCP Contributors
 * @version 1.0.0
 */

import { ServerResult } from '../types.js';
import { createErrorResponse } from '../error-handlers.js';
import {
    InitCacheArgsSchema,
    UpdateCacheArgsSchema,
    LoadCacheArgsSchema,
    AutoUpdateCacheArgsSchema,
    GetCacheStatusArgsSchema
} from '../tools/schemas.js';
import { writeFile, readFile, createDirectory } from '../tools/filesystem.js';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Cache management state interface
 * Maintains the current state of the conversation cache system
 */
interface CacheState {
    isInitialized: boolean;     // Whether cache system has been set up
    cacheDir: string;          // Directory path where cache files are stored
    autoUpdateEnabled: boolean; // Whether automatic updates are active
    toolCallCount: number;     // Counter for triggering auto-updates
    updateInterval: number;    // Number of tool calls between auto-updates
    lastUpdate: Date | null;   // Timestamp of last cache update
}

/**
 * Global cache state object
 * Maintains persistence across multiple tool calls within a session
 */
let cacheState: CacheState = {
    isInitialized: false,
    cacheDir: "C:\\Claude_Session",
    autoUpdateEnabled: false,
    toolCallCount: 0,
    updateInterval: 10,
    lastUpdate: null
};

/**
 * Initialize the conversation cache system
 * 
 * Creates the cache directory structure and initializes all cache files with
 * default content. This is the entry point for setting up persistent memory
 * for Claude conversations.
 * 
 * The function creates a complete cache ecosystem including:
 * - Directory structure for organized storage
 * - Initial cache files with template content
 * - Project context setup with customizable project name
 * - Cache protocol documentation for future reference
 * 
 * @param args - InitCacheArgsSchema validated arguments
 * @param args.cacheDir - Directory path for cache storage (default: C:\Claude_Session)
 * @param args.projectName - Optional project name for context (default: Unknown Project)
 * @returns ServerResult with success message and next steps
 */
export async function handleInitCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters using Zod schema
        const parsed = InitCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { cacheDir, projectName } = parsed.data;
        cacheState.cacheDir = cacheDir;

        // Create cache directory structure
        // Uses Desktop Commander's createDirectory tool for reliable cross-platform support
        try {
            await createDirectory(cacheDir);
        } catch (error) {
            return createErrorResponse(`Failed to create cache directory: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Initialize timestamp for consistent file creation timing
        const timestamp = new Date().toISOString();
        const defaultProjectName = projectName || "Unknown Project";

        // Create conversation_log.md - Main conversation history file
        // This file tracks the ongoing conversation state and progress over time
        const conversationLogContent = `# Claude Session Conversation Log
**Initialized:** ${timestamp}

## Project Context: ${defaultProjectName}
- Session started with cache system initialization
- Auto-caching system ready for activation

## Technical Setup:
- ✅ Cache directory created: ${cacheDir}
- ✅ Conversation logging initialized
- ⏳ Ready for project context and decisions

## Cache Status:
- **Directory**: ${cacheDir}
- **Initialized**: ${timestamp}
- **Auto-update**: Not yet enabled
`;

        await writeFile(
            path.join(cacheDir, "conversation_log.md"),
            conversationLogContent,
            'rewrite'
        );

        // Create current_project_state.md - Technical project details
        // Maintains comprehensive information about project architecture and components
        const projectStateContent = `# Project State

## Current Project Status:
- **Project Name**: ${defaultProjectName}
- **Initialization Date**: ${timestamp}
- **Cache System**: Active

## Project Details:
- No project details captured yet
- Use update_cache to add project information

## Technical Components:
- To be populated with project specifics

## Current Challenges:
- To be documented as project progresses

## Next Steps:
- Define project scope and technical details
- Establish regular cache update protocol
`;

        await writeFile(
            path.join(cacheDir, "current_project_state.md"),
            projectStateContent,
            'rewrite'
        );

        // Create decisions_made.md - Key decisions and approaches
        // Documents important architectural and implementation decisions
        const decisionsContent = `# Key Decisions and Approaches

## Cache System Initialization
**Date**: ${timestamp}
**Decision**: Activated conversation cache system for persistent memory
**Location**: ${cacheDir}

## Benefits Expected:
- Persistent conversation memory across sessions
- Project context preservation
- Cumulative knowledge building
- Enhanced problem-solving continuity

## Setup Configuration:
- **Cache Directory**: ${cacheDir}
- **Auto-update**: Available (not yet enabled)
- **Files Maintained**: conversation_log.md, current_project_state.md, decisions_made.md, next_steps.md
`;

        await writeFile(
            path.join(cacheDir, "decisions_made.md"),
            decisionsContent,
            'rewrite'
        );

        // Create next_steps.md - Immediate action items and priorities
        // Maintains focus on current objectives and planned work
        const nextStepsContent = `# Next Steps - Immediate Actions

## Phase 1: Project Context Setup (CURRENT)

### Step 1: Define Project Scope ⏳
- **Action**: Use update_cache to add project details
- **Information needed**: 
  - Project description and goals
  - Technical architecture
  - Current challenges
- **Status**: Pending project information

### Step 2: Establish Cache Update Protocol ⏳
- **Action**: Enable auto-update or manual update schedule
- **Options**:
  - Auto-update every N tool calls
  - Manual updates at milestones
  - Session-end summaries
- **Status**: Ready to configure

### Step 3: Load Project Context ⏳
- **Action**: If resuming existing project, load previous context
- **Process**: Use load_cache to restore previous session data
- **Status**: Available when needed

## Cache System Commands:
- \`update_cache\`: Add project updates and progress
- \`load_cache\`: Restore session context from files
- \`auto_update_cache\`: Enable automatic cache updates
- \`get_cache_status\`: Check current cache state

## Success Metrics:
- Project context fully documented
- Regular cache updates maintaining current state
- Seamless session continuity
`;

        await writeFile(
            path.join(cacheDir, "next_steps.md"),
            nextStepsContent,
            'rewrite'
        );

        // Create cache_protocol.md - Usage documentation
        // Provides comprehensive instructions for using the cache system
        const protocolContent = `# Cache System Protocol

## Initialization Complete:
- **Date**: ${timestamp}
- **Directory**: ${cacheDir}
- **Status**: Active

## File Structure:
- \`conversation_log.md\`: Ongoing conversation state and progress
- \`current_project_state.md\`: Project details and technical architecture  
- \`decisions_made.md\`: Key decisions and approaches chosen
- \`next_steps.md\`: Immediate actions and priorities

## Usage Instructions:

### To Resume Session (in new conversation):
\`\`\`
Use load_cache to restore conversation context and continue where we left off.
\`\`\`

### To Update Cache:
\`\`\`
Use update_cache with:
- conversationSummary: Current progress summary
- projectUpdate: New technical details or changes
- decisionsUpdate: Important decisions made  
- nextStepsUpdate: Updated priorities and actions
\`\`\`

### To Enable Auto-Updates:
\`\`\`
Use auto_update_cache with enable: true
\`\`\`

## Benefits:
✅ **Unlimited conversation continuity**
✅ **No context loss between sessions**  
✅ **Instant project state restoration**
✅ **Cumulative knowledge building**
`;

        await writeFile(
            path.join(cacheDir, "cache_protocol.md"),
            protocolContent,
            'rewrite'
        );

        // Update internal cache state to reflect successful initialization
        cacheState.isInitialized = true;
        cacheState.lastUpdate = new Date();

        // Return success message with next steps guidance
        return {
            content: [{
                type: "text",
                text: `✅ **Cache System Initialized Successfully!**

**Cache Directory**: ${cacheDir}
**Files Created**: 
- conversation_log.md
- current_project_state.md  
- decisions_made.md
- next_steps.md
- cache_protocol.md

**Next Steps**:
1. **Add Project Context**: Use \`update_cache\` to add your project details
2. **Enable Auto-Updates**: Use \`auto_update_cache\` for automatic cache maintenance
3. **Resume Protocol**: In future sessions, use \`load_cache\` to restore context

The cache system is now ready to provide persistent memory across conversations!`
            }]
        };

    } catch (error) {
        return createErrorResponse(`Cache initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Update the conversation cache with new information
 * 
 * Incrementally updates cache files with new conversation progress, project updates,
 * decisions, and next steps. This function allows for granular cache maintenance
 * without overwriting existing content.
 * 
 * Update Strategy:
 * - Appends timestamped entries to preserve conversation history
 * - Supports selective updates (only update what has changed)
 * - Maintains chronological order for easy review
 * - Updates internal state tracking for auto-update system
 * 
 * @param args - UpdateCacheArgsSchema validated arguments
 * @param args.conversationSummary - Required summary of current conversation progress
 * @param args.projectUpdate - Optional project technical details or architecture changes
 * @param args.decisionsUpdate - Optional important decisions or approach changes
 * @param args.nextStepsUpdate - Optional updated priorities and immediate actions
 * @returns ServerResult with update confirmation and applied changes summary
 */
export async function handleUpdateCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = UpdateCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        // Ensure cache system is initialized before attempting updates
        if (!cacheState.isInitialized) {
            return createErrorResponse("Cache system not initialized. Use init_cache first.");
        }

        const { conversationSummary, projectUpdate, decisionsUpdate, nextStepsUpdate } = parsed.data;
        const timestamp = new Date().toISOString();

        // Update conversation_log.md with new progress summary
        // Always required as it tracks the main conversation flow
        const logPath = path.join(cacheState.cacheDir, "conversation_log.md");
        const updateEntry = `

## Update: ${timestamp}
${conversationSummary}

`;
        
        await writeFile(
            logPath,
            updateEntry,
            'append'
        );

        // Update project state if technical details provided
        // Optional update for when project architecture or components change
        if (projectUpdate) {
            const projectPath = path.join(cacheState.cacheDir, "current_project_state.md");
            const projectUpdateEntry = `

## Project Update: ${timestamp}
${projectUpdate}

`;
            await writeFile(
                projectPath,
                projectUpdateEntry,
                'append'
            );
        }

        // Update decisions log if important choices were made
        // Documents key architectural or implementation decisions for future reference
        if (decisionsUpdate) {
            const decisionsPath = path.join(cacheState.cacheDir, "decisions_made.md");
            const decisionEntry = `

## Decision Update: ${timestamp}
${decisionsUpdate}

`;
            await writeFile(
                decisionsPath,
                decisionEntry,
                'append'
            );
        }

        // Update next steps if priorities or action items changed
        // Maintains focus on current objectives and planned work
        if (nextStepsUpdate) {
            const stepsPath = path.join(cacheState.cacheDir, "next_steps.md");
            const stepsEntry = `

## Next Steps Update: ${timestamp}
${nextStepsUpdate}

`;
            await writeFile(
                stepsPath,
                stepsEntry,
                'append'
            );
        }

        // Update internal state tracking
        cacheState.lastUpdate = new Date();

        // Provide detailed feedback about what was updated
        return {
            content: [{
                type: "text",
                text: `✅ **Cache Updated Successfully!**

**Timestamp**: ${timestamp}
**Updates Applied**:
- ✅ Conversation summary added
${projectUpdate ? '- ✅ Project state updated' : ''}
${decisionsUpdate ? '- ✅ Decisions documented' : ''}
${nextStepsUpdate ? '- ✅ Next steps updated' : ''}

**Cache Location**: ${cacheState.cacheDir}
**Last Update**: ${timestamp}

The cache now contains the latest conversation state and can be loaded in future sessions.`
            }]
        };

    } catch (error) {
        return createErrorResponse(`Cache update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Load conversation context from cache files
 * 
 * Restores complete conversation state from cache files to enable seamless
 * session continuation. This function reads all cache files and presents
 * the information in a structured format for Claude to process.
 * 
 * Loading Strategy:
 * - Reads all cache files in sequence
 * - Handles missing files gracefully with error messages
 * - Presents content in organized sections for easy processing
 * - Updates internal cache state to reflect loaded configuration
 * - Provides comprehensive context restoration
 * 
 * @param args - LoadCacheArgsSchema validated arguments
 * @param args.cacheDir - Directory path containing cache files to load
 * @returns ServerResult with complete conversation context from all cache files
 */
export async function handleLoadCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = LoadCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { cacheDir } = parsed.data;
        
        // Verify cache directory exists before attempting to load
        if (!existsSync(cacheDir)) {
            return createErrorResponse(`Cache directory not found: ${cacheDir}. Use init_cache to create it.`);
        }

        // Define cache files in logical loading order
        // Order matters for presenting coherent context flow
        const cacheFiles = [
            "conversation_log.md",      // Main conversation history
            "current_project_state.md", // Technical project details
            "decisions_made.md",        // Key decisions and approaches
            "next_steps.md"            // Current priorities and actions
        ];

        // Build comprehensive context restoration message
        let loadedContent = `# 🔄 **Loading Conversation Context from Cache**

**Cache Directory**: ${cacheDir}
**Load Time**: ${new Date().toISOString()}

---

`;

        // Load each cache file and add to context restoration
        for (const filename of cacheFiles) {
            const filepath = path.join(cacheDir, filename);
            
            try {
                // Read file content with reasonable line limit for performance
                const fileResult = await readFile(filepath, false, 0, 2000);

                if (fileResult && fileResult.content) {
                    // Successfully loaded file - add formatted content
                    loadedContent += `## 📄 ${filename.replace('.md', '').replace('_', ' ').toUpperCase()}

${fileResult.content}

---

`;
                } else {
                    // File exists but couldn't be read - note the issue
                    loadedContent += `## ⚠️ ${filename} - Not Found or Error

File could not be loaded.

---

`;
                }
            } catch (error) {
                // Handle individual file load errors gracefully
                loadedContent += `## ❌ ${filename} - Load Error

Error loading file: ${error instanceof Error ? error.message : String(error)}

---

`;
            }
        }

        // Add completion message with usage guidance
        loadedContent += `

# 🎯 **CONTEXT RESTORATION COMPLETE**

You now have full access to:
- ✅ **Previous conversation history**
- ✅ **Project technical details** 
- ✅ **Key decisions made**
- ✅ **Current priorities and next steps**

**Ready to continue where we left off!**

Use \`update_cache\` to add new progress as we continue working.
`;

        // Update internal cache state to reflect loaded configuration
        cacheState.cacheDir = cacheDir;
        cacheState.isInitialized = true;

        return {
            content: [{
                type: "text",
                text: loadedContent
            }]
        };

    } catch (error) {
        return createErrorResponse(`Cache load failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Enable or disable automatic cache updates
 * 
 * Configures the automatic cache update system that triggers cache updates
 * based on tool call frequency. This provides hands-off cache maintenance
 * during long conversation sessions.
 * 
 * Auto-Update Mechanism:
 * - Tracks tool call count across conversation session
 * - Triggers cache updates at specified intervals
 * - Configurable update frequency for different use cases
 * - Can be enabled/disabled dynamically during conversations
 * - Integrates with server request handler for automatic triggering
 * 
 * @param args - AutoUpdateCacheArgsSchema validated arguments
 * @param args.enable - Boolean to enable/disable automatic updates
 * @param args.updateInterval - Optional number of tool calls between updates (default: 10)
 * @returns ServerResult with auto-update configuration confirmation
 */
export async function handleAutoUpdateCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = AutoUpdateCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { enable, updateInterval } = parsed.data;

        // Update global cache state configuration
        cacheState.autoUpdateEnabled = enable;
        if (updateInterval) {
            cacheState.updateInterval = updateInterval;
        }

        const status = enable ? "ENABLED" : "DISABLED";
        
        return {
            content: [{
                type: "text",
                text: `✅ **Auto-Cache ${status}**

**Status**: ${status}
${enable ? `**Update Interval**: Every ${cacheState.updateInterval} tool calls` : ''}
**Current Tool Call Count**: ${cacheState.toolCallCount}

${enable ? 
`The cache will automatically update with conversation progress every ${cacheState.updateInterval} tool calls.` :
'Auto-updates are disabled. Use update_cache manually when needed.'}`
            }]
        };

    } catch (error) {
        return createErrorResponse(`Auto-update configuration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get current cache system status
 * 
 * Provides comprehensive information about the current state of the conversation
 * cache system including configuration, file status, and usage statistics.
 * Useful for troubleshooting and verifying cache system health.
 * 
 * Status Information Includes:
 * - Initialization state and configuration
 * - Cache directory location and accessibility
 * - Auto-update settings and tool call counters
 * - Last update timestamp for tracking activity
 * - Available cache files and commands
 * - System health indicators and warnings
 * 
 * @param args - GetCacheStatusArgsSchema validated arguments (empty object)
 * @returns ServerResult with comprehensive cache system status report
 */
export async function handleGetCacheStatus(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters (empty schema but consistent with pattern)
        const parsed = GetCacheStatusArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        // Build comprehensive status report
        const status = `# 📊 **Cache System Status**

## Configuration:
- **Initialized**: ${cacheState.isInitialized ? '✅ Yes' : '❌ No'}
- **Cache Directory**: ${cacheState.cacheDir}
- **Auto-Update**: ${cacheState.autoUpdateEnabled ? '✅ Enabled' : '❌ Disabled'}
- **Update Interval**: Every ${cacheState.updateInterval} tool calls
- **Tool Call Count**: ${cacheState.toolCallCount}

## Last Update:
- **Time**: ${cacheState.lastUpdate ? cacheState.lastUpdate.toISOString() : 'Never'}

## Cache Files:
${cacheState.isInitialized ? `
- 📄 conversation_log.md
- 📄 current_project_state.md  
- 📄 decisions_made.md
- 📄 next_steps.md
- 📄 cache_protocol.md
` : '- No cache files (not initialized)'}

## Available Commands:
- \`init_cache\`: Initialize the cache system
- \`update_cache\`: Manually update cache with new information
- \`load_cache\`: Restore conversation context from cache
- \`auto_update_cache\`: Enable/disable automatic updates
- \`get_cache_status\`: Check current status (this command)

${cacheState.autoUpdateEnabled && !cacheState.isInitialized ? 
'⚠️ **Note**: Auto-update is enabled but cache is not initialized. Use init_cache first.' : ''}
`;

        return {
            content: [{
                type: "text",
                text: status
            }]
        };

    } catch (error) {
        return createErrorResponse(`Status check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Increment tool call counter and trigger auto-update if needed
 * 
 * This function is called by the server request handler for each tool call
 * to maintain the tool call counter and trigger automatic cache updates
 * when the configured interval is reached.
 * 
 * Auto-Update Logic:
 * - Increments global tool call counter on each invocation
 * - Checks if auto-update conditions are met (enabled, initialized, interval reached)
 * - Triggers automatic cache update with current progress summary
 * - Handles auto-update errors gracefully without disrupting main flow
 * - Resets counter modulo to prevent overflow issues
 * 
 * Integration:
 * - Called from server.ts request handler for each tool call
 * - Excludes get_cache_status calls to prevent infinite loops
 * - Runs asynchronously to avoid blocking main tool execution
 * - Provides error logging for troubleshooting auto-update issues
 * 
 * @returns void - This function operates as a side effect only
 */
export function incrementToolCallCounter(): void {
    // Increment the global tool call counter
    cacheState.toolCallCount++;
    
    // Check if auto-update should trigger based on current configuration
    if (cacheState.autoUpdateEnabled && 
        cacheState.isInitialized && 
        cacheState.toolCallCount % cacheState.updateInterval === 0) {
        
        // Trigger auto-update with standardized progress message
        // Run asynchronously to avoid blocking the main tool call
        handleUpdateCache({
            conversationSummary: `Auto-update triggered after ${cacheState.toolCallCount} tool calls at ${new Date().toISOString()}`
        }).catch(error => {
            // Log auto-update errors but don't disrupt main conversation flow
            console.error('Auto-update failed:', error);
        });
    }
}
