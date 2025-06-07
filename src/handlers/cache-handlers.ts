/**
 * Cache Management Handlers for Desktop Commander MCP
 * 
 * Enhanced Topic-Based Session Continuation System with Persistent Memory
 * 
 * This module implements a conversation persistence system that provides Claude with
 * topic-isolated, long-term memory across conversation sessions. Each topic maintains
 * its own persistent memory while enabling seamless session continuation.
 * 
 * Key Features:
 * - Topic-based conversation isolation (no mixing different projects)
 * - Persistent memory per topic across sessions  
 * - Session continuation when hitting conversation limits
 * - Permission-based directory creation for user control
 * - Automatic cleanup and topic management
 * - Cumulative knowledge building over time per topic
 * 
 * Architecture:
 * - File-based storage using Desktop Commander's filesystem tools
 * - Topic-isolated directories for project separation
 * - Session manifest tracking active topics
 * - Structured markdown files for human-readable cache content
 * - Auto-update capability triggered by tool call counters
 * - Permission-based security for directory creation
 * 
 * Topic Structure:
 * C:\Claude_Session\
 * ├── wow_backup\               # Topic-specific persistent memory
 * │   ├── conversation_log.md   # All conversations about this topic
 * │   ├── current_project_state.md # Current architecture & status
 * │   ├── decisions_made.md     # All decisions over time  
 * │   └── next_steps.md         # Current priorities
 * ├── react_dashboard\          # Different topic, isolated memory
 * │   └── ... (same structure)
 * └── session_manifest.json     # Active topic tracking
 * 
 * @author Desktop Commander MCP Contributors
 * @version 2.0.0 - Topic-Based Session Continuation
 */

import { ServerResult } from '../types.js';
import { createErrorResponse } from '../error-handlers.js';
import {
    InitCacheArgsSchema,
    UpdateCacheArgsSchema,
    LoadCacheArgsSchema,
    AutoUpdateCacheArgsSchema,
    GetCacheStatusArgsSchema,
    GetCacheTopicsArgsSchema,
    ArchiveCacheArgsSchema,
    CleanupCacheArgsSchema
} from '../tools/schemas.js';
import { writeFile, readFile, readFileInternal, createDirectory, listDirectory } from '../tools/filesystem.js';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Enhanced cache management state interface
 * Maintains the current state of the conversation cache system with topic support
 */
interface CacheState {
    isInitialized: boolean;          // Whether cache system has been set up
    cacheDir: string;               // Base directory path where cache files are stored
    currentTopic: string | null;    // Currently active topic (null = no topic/legacy mode)
    autoUpdateEnabled: boolean;     // Whether automatic updates are active
    toolCallCount: number;          // Counter for triggering auto-updates
    updateInterval: number;         // Number of tool calls between auto-updates
    lastUpdate: Date | null;        // Timestamp of last cache update
    
    // NEW: Topic and permission management
    activeTopic: string | null;     // Currently loaded topic
    hasCreatePermission: boolean;   // User granted directory creation permission
    permissionGrantedAt: Date | null; // When permission was granted
    topicAutoUpdateSettings: Map<string, boolean>; // Per-topic auto-update settings
}

/**
 * Session manifest interface for tracking active topics
 */
interface SessionManifest {
    activeSessions: Record<string, {
        createdAt: string;
        lastUsed: string;
        projectName: string;
        autoCleanupAfterDays?: number;
        sessionOnly?: boolean;
        archivedAt?: string; // Added for archived sessions
    }>;
    archivedSessions?: Record<string, {
        createdAt: string;
        lastUsed: string;
        projectName: string;
        autoCleanupAfterDays?: number;
        sessionOnly?: boolean;
        archivedAt: string; // Required for archived sessions
    }>; // Added for archived sessions tracking
    manifestVersion: string;
}

/**
 * Global cache state object
 * Maintains persistence across multiple tool calls within a session
 */
let cacheState: CacheState = {
    isInitialized: false,
    cacheDir: "C:\\Claude_Session",
    currentTopic: null,
    autoUpdateEnabled: false,
    toolCallCount: 0,
    updateInterval: 10,
    lastUpdate: null,
    activeTopic: null,
    hasCreatePermission: false,
    permissionGrantedAt: null,
    topicAutoUpdateSettings: new Map()
};

/**
 * Get the appropriate cache directory for a topic
 * Maintains backward compatibility: no topic = original behavior
 * 
 * @param baseCacheDir - Base cache directory path
 * @param topic - Optional topic name for isolation
 * @returns Full path to cache directory for the topic
 */
function getCacheDirectory(baseCacheDir: string, topic?: string): string {
    // Backward compatibility: no topic = use base directory directly (original behavior)
    if (!topic) {
        return baseCacheDir;
    }
    
    // Topic specified: create isolated subdirectory
    return path.join(baseCacheDir, topic);
}

/**
 * Load session manifest for topic tracking
 * Creates manifest if it doesn't exist
 * 
 * @param baseCacheDir - Base cache directory containing the manifest
 * @returns Session manifest object
 */
async function loadSessionManifest(baseCacheDir: string): Promise<SessionManifest> {
    const manifestPath = path.join(baseCacheDir, 'session_manifest.json');
    
    try {
        if (existsSync(manifestPath)) {
            const manifestContent = await readFileInternal(manifestPath, 0, 1000);
            return JSON.parse(manifestContent);
        }
    } catch (error) {
        console.warn('Failed to load session manifest, creating new one:', error);
    }
    
    // Return default manifest
    return {
        activeSessions: {},
        manifestVersion: "2.0.0"
    };
}

/**
 * Save session manifest for topic tracking
 * 
 * @param baseCacheDir - Base cache directory to save manifest in
 * @param manifest - Session manifest to save
 */
async function saveSessionManifest(baseCacheDir: string, manifest: SessionManifest): Promise<void> {
    const manifestPath = path.join(baseCacheDir, 'session_manifest.json');
    
    try {
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'rewrite');
    } catch (error) {
        console.warn('Failed to save session manifest:', error);
    }
}

/**
 * Check if user has granted permission to create directories
 * 
 * @param confirmCreate - User's explicit permission flag
 * @param understoodGrowth - User's acknowledgment of file growth
 * @returns Error message if permission denied, null if granted
 */
function checkCreatePermission(confirmCreate: boolean, understoodGrowth: boolean): string | null {
    if (!confirmCreate || !understoodGrowth) {
        return `🚫 **Permission Required to Create Cache Directory**

Cache directory does not exist. To enable the cache system, you must explicitly grant permission.

**Required Parameters:**
- \`confirmCreate: true\` - Explicit consent to create directory
- \`understoodGrowth: true\` - Acknowledgment that cache files will grow over time

**Estimated Growth:** 1-5MB per year with normal use, potentially more with heavy usage.

**Example:**
\`\`\`
init_cache({
  "topic": "my_project",
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\`

**Privacy Note:** Cache files contain conversation history and project details. Choose cache directory location carefully.`;
    }
    
    return null; // Permission granted
}

/**
 * Initialize the conversation cache system with enhanced topic support
 * 
 * Creates topic-isolated cache directory structure and initializes all cache files.
 * Supports both legacy (no topic) and new topic-based operation modes.
 * Requires explicit user permission to create new directories for security.
 * 
 * Topic Isolation:
 * - No topic specified: Uses base directory (backward compatible)
 * - Topic specified: Creates isolated subdirectory for the topic
 * - Multiple topics: Each gets completely separate persistent memory
 * 
 * Permission System:
 * - Directory exists: No permission required, initialize immediately
 * - Directory missing: Requires confirmCreate=true and understoodGrowth=true
 * - Security: Never creates directories without explicit user consent
 * 
 * @param args - InitCacheArgsSchema validated arguments
 * @param args.cacheDir - Base directory path for cache storage (default: C:\Claude_Session)
 * @param args.projectName - Optional project name for context (default: Unknown Project)
 * @param args.topic - Optional topic name for isolation (default: null, uses base directory)
 * @param args.confirmCreate - Required explicit consent to create directories (default: false)
 * @param args.understoodGrowth - Required acknowledgment of file growth (default: false)
 * @param args.sessionOnly - Mark as temporary session cache (default: false)
 * @returns ServerResult with success message and next steps
 */
export async function handleInitCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters using Zod schema
        const parsed = InitCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { cacheDir: baseCacheDir, projectName, topic, confirmCreate, understoodGrowth, sessionOnly } = parsed.data;
        
        // Determine actual cache directory (with or without topic isolation)
        const actualCacheDir = getCacheDirectory(baseCacheDir, topic);
        
        // Check if directory already exists
        const directoryExists = existsSync(actualCacheDir);
        
        // If directory doesn't exist, check for user permission
        if (!directoryExists) {
            const permissionError = checkCreatePermission(confirmCreate || false, understoodGrowth || false);
            if (permissionError) {
                return {
                    content: [{
                        type: "text",
                        text: permissionError
                    }]
                };
            }
        }

        // Create cache directory structure if needed
        try {
            await createDirectory(actualCacheDir);
            
            // Also ensure base directory exists for manifest
            if (topic && !existsSync(baseCacheDir)) {
                await createDirectory(baseCacheDir);
            }
        } catch (error) {
            return createErrorResponse(`Failed to create cache directory: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Initialize timestamp for consistent file creation timing
        const timestamp = new Date().toISOString();
        const defaultProjectName = projectName || (topic ? `${topic} Project` : "Unknown Project");

        // Update session manifest for topic tracking
        if (topic) {
            const manifest = await loadSessionManifest(baseCacheDir);
            manifest.activeSessions[topic] = {
                createdAt: timestamp,
                lastUsed: timestamp,
                projectName: defaultProjectName,
                autoCleanupAfterDays: sessionOnly ? 7 : undefined,
                sessionOnly: sessionOnly
            };
            await saveSessionManifest(baseCacheDir, manifest);
        }

        // Create conversation_log.md - Main conversation history file
        const conversationLogContent = `# Claude Session Conversation Log${topic ? ` - ${topic}` : ''}
**Initialized:** ${timestamp}
${topic ? `**Topic:** ${topic}` : ''}

## Project Context: ${defaultProjectName}
- Session started with cache system initialization
- ${topic ? 'Topic-based isolation active' : 'Legacy cache mode (no topic isolation)'}
- Auto-caching system ready for activation

## Technical Setup:
- ✅ Cache directory created: ${actualCacheDir}
- ✅ Conversation logging initialized
${topic ? '- ✅ Topic isolation active' : '- ⚠️ No topic isolation (legacy mode)'}
- ⏳ Ready for project context and decisions

## Cache Status:
- **Directory**: ${actualCacheDir}
- **Topic**: ${topic || 'None (legacy mode)'}
- **Initialized**: ${timestamp}
- **Auto-update**: Not yet enabled
`;

        await writeFile(
            path.join(actualCacheDir, "conversation_log.md"),
            conversationLogContent,
            'rewrite'
        );

        // Create current_project_state.md - Technical project details
        const projectStateContent = `# Project State${topic ? ` - ${topic}` : ''}

## Current Project Status:
- **Project Name**: ${defaultProjectName}
- **Topic**: ${topic || 'None (legacy mode)'}
- **Initialization Date**: ${timestamp}
- **Cache System**: Active
- **Session Type**: ${sessionOnly ? 'Temporary Session Cache' : 'Persistent Project Memory'}

## Project Details:
- No project details captured yet
- Use update_cache to add project information
${topic ? '- This topic has isolated memory - no mixing with other topics' : '- Using legacy mode - single shared cache'}

## Technical Components:
- To be populated with project specifics

## Current Challenges:
- To be documented as project progresses

## Next Steps:
- Define project scope and technical details
- Establish regular cache update protocol
${topic ? '- Consider enabling topic-specific auto-updates' : '- Consider enabling auto-updates'}
`;

        await writeFile(
            path.join(actualCacheDir, "current_project_state.md"),
            projectStateContent,
            'rewrite'
        );

        // Create decisions_made.md - Key decisions and approaches
        const decisionsContent = `# Key Decisions and Approaches${topic ? ` - ${topic}` : ''}

## Cache System Initialization
**Date**: ${timestamp}
**Decision**: Activated conversation cache system for persistent memory
**Topic**: ${topic || 'None (legacy mode)'}
**Location**: ${actualCacheDir}

## Cache Configuration:
- **Topic Isolation**: ${topic ? 'Enabled - isolated from other topics' : 'Disabled - legacy single cache mode'}
- **Session Type**: ${sessionOnly ? 'Temporary session cache' : 'Persistent project memory'}
- **Auto-cleanup**: ${sessionOnly ? 'Enabled (7 days)' : 'Manual management'}

## Benefits Expected:
- ${topic ? 'Topic-isolated persistent memory across sessions' : 'Legacy persistent memory across sessions'}
- Project context preservation
- Cumulative knowledge building
- Enhanced problem-solving continuity
${topic ? '- No mixing with other project topics' : '- Single shared memory space'}

## Setup Configuration:
- **Cache Directory**: ${actualCacheDir}
- **Auto-update**: Available (not yet enabled)
- **Files Maintained**: conversation_log.md, current_project_state.md, decisions_made.md, next_steps.md
`;

        await writeFile(
            path.join(actualCacheDir, "decisions_made.md"),
            decisionsContent,
            'rewrite'
        );

        // Create next_steps.md - Immediate action items and priorities
        const nextStepsContent = `# Next Steps - Immediate Actions${topic ? ` - ${topic}` : ''}

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
- **Process**: Use load_cache${topic ? ` with topic "${topic}"` : ''} to restore previous session data
- **Status**: Available when needed

## Cache System Commands:
- \`update_cache\`: Add project updates and progress
- \`load_cache\`: Restore session context from files
- \`auto_update_cache\`: Enable automatic cache updates
- \`get_cache_status\`: Check current cache state
${topic ? `- \`get_cache_topics\`: List all available topics
- \`archive_cache\`: Archive completed topics` : ''}

## Topic Management:
${topic ? `- **Current Topic**: ${topic}
- **Topic Isolation**: Active - this topic has completely separate memory
- **Other Topics**: Will not interfere with this topic's memory
- **Topic Switching**: Use load_cache with different topic to switch contexts` : `- **No Topic Isolation**: Using legacy single cache mode
- **Consider Topics**: For multiple projects, consider using topic-based isolation`}

## Success Metrics:
- Project context fully documented
- Regular cache updates maintaining current state
- Seamless session continuity
${topic ? '- Clear topic isolation maintained' : ''}
`;

        await writeFile(
            path.join(actualCacheDir, "next_steps.md"),
            nextStepsContent,
            'rewrite'
        );

        // Create cache_protocol.md - Usage documentation
        const protocolContent = `# Cache System Protocol${topic ? ` - ${topic}` : ''}

## Initialization Complete:
- **Date**: ${timestamp}
- **Directory**: ${actualCacheDir}
- **Topic**: ${topic || 'None (legacy mode)'}
- **Status**: Active

## File Structure:
- \`conversation_log.md\`: Ongoing conversation state and progress
- \`current_project_state.md\`: Project details and technical architecture  
- \`decisions_made.md\`: Key decisions and approaches chosen
- \`next_steps.md\`: Immediate actions and priorities

## Usage Instructions:

### To Resume Session (in new conversation):
${topic ? `\`\`\`
load_cache({"topic": "${topic}"})
\`\`\`` : `\`\`\`
load_cache()
\`\`\``}

### To Update Cache:
${topic ? `\`\`\`
update_cache({
  "topic": "${topic}",
  "conversationSummary": "Current progress summary",
  "projectUpdate": "New technical details or changes",
  "decisionsUpdate": "Important decisions made",
  "nextStepsUpdate": "Updated priorities and actions"
})
\`\`\`` : `\`\`\`
update_cache({
  "conversationSummary": "Current progress summary",
  "projectUpdate": "New technical details or changes",
  "decisionsUpdate": "Important decisions made",
  "nextStepsUpdate": "Updated priorities and actions"
})
\`\`\``}

### To Enable Auto-Updates:
${topic ? `\`\`\`
auto_update_cache({"enable": true, "topic": "${topic}"})
\`\`\`` : `\`\`\`
auto_update_cache({"enable": true})
\`\`\``}

${topic ? `### Topic Management:
\`\`\`
get_cache_topics()           # List all available topics
get_cache_status({"topic": "${topic}"})  # Check this topic's status
archive_cache({"topic": "${topic}", "confirmArchive": true})  # Archive when done
\`\`\`

### Topic Isolation Benefits:
- **Separate Memory**: This topic's memory is completely isolated from other topics
- **No Context Mixing**: Won't confuse ${topic} project with other projects
- **Parallel Work**: Can work on multiple topics simultaneously in different conversations
- **Persistent Per-Topic**: Each topic builds cumulative knowledge over time` : ''}

## Benefits:
✅ **${topic ? 'Topic-isolated conversation continuity' : 'Conversation continuity'}**
✅ **No context loss between sessions**  
✅ **Instant project state restoration**
✅ **Cumulative knowledge building**
${topic ? '✅ **Complete topic isolation - no mixing with other projects**' : ''}
`;

        await writeFile(
            path.join(actualCacheDir, "cache_protocol.md"),
            protocolContent,
            'rewrite'
        );

        // Update internal cache state to reflect successful initialization
        cacheState.isInitialized = true;
        cacheState.cacheDir = baseCacheDir;
        cacheState.currentTopic = topic || null;
        cacheState.activeTopic = topic || null;
        cacheState.hasCreatePermission = true;
        cacheState.permissionGrantedAt = new Date();
        cacheState.lastUpdate = new Date();

        // Return success message with topic-aware guidance
        return {
            content: [{
                type: "text",
                text: `✅ **Cache System Initialized Successfully!**

**Cache Directory**: ${actualCacheDir}
**Topic**: ${topic || 'None (legacy mode)'}
**Project**: ${defaultProjectName}
**Mode**: ${topic ? 'Topic-based isolation' : 'Legacy single cache'}

**Files Created**: 
- conversation_log.md
- current_project_state.md  
- decisions_made.md
- next_steps.md
- cache_protocol.md

**Next Steps**:
1. **Add Project Context**: Use \`update_cache\` to add your project details
2. **Enable Auto-Updates**: Use \`auto_update_cache\` for automatic cache maintenance
3. **Resume Protocol**: In future sessions, use \`load_cache${topic ? `({"topic": "${topic}"})` : '()'}\` to restore context

${topic ? `**Topic Isolation Active**: This topic (${topic}) has completely separate memory from other topics. You can work on multiple projects simultaneously without context mixing.` : '**Legacy Mode**: Using single shared cache. Consider using topics for multiple projects.'}

${sessionOnly ? '**Session Cache**: Configured for temporary use with auto-cleanup after 7 days.' : '**Persistent Memory**: This cache will persist indefinitely for cumulative knowledge building.'}

The cache system is now ready to provide ${topic ? 'topic-isolated ' : ''}persistent memory across conversations!`
            }]
        };

    } catch (error) {
        return createErrorResponse(`Cache initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Update the conversation cache with new information (Enhanced Topic Support)
 * 
 * Incrementally updates cache files with new conversation progress, project updates,
 * decisions, and next steps. Supports both topic-specific and legacy updates.
 * Maintains topic isolation while preserving backward compatibility.
 * 
 * Topic Support:
 * - Topic specified: Updates only that topic's cache files
 * - No topic + current topic active: Uses currently active topic
 * - No topic + no active topic: Uses legacy mode (base directory)
 * - Topic validation: Ensures topic exists before updating
 * 
 * Update Strategy:
 * - Appends timestamped entries to preserve conversation history
 * - Supports selective updates (only update what has changed)
 * - Maintains chronological order for easy review
 * - Updates internal state tracking for auto-update system
 * - Validates directory exists before attempting updates
 * 
 * @param args - UpdateCacheArgsSchema validated arguments
 * @param args.conversationSummary - Required summary of current conversation progress
 * @param args.projectUpdate - Optional project technical details or architecture changes
 * @param args.decisionsUpdate - Optional important decisions or approach changes
 * @param args.nextStepsUpdate - Optional updated priorities and immediate actions
 * @param args.topic - Optional topic specification (uses active topic if omitted)
 * @returns ServerResult with update confirmation and applied changes summary
 */
export async function handleUpdateCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = UpdateCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { conversationSummary, projectUpdate, decisionsUpdate, nextStepsUpdate, topic } = parsed.data;

        // Determine which topic to update
        let targetTopic = topic;
        if (!targetTopic && cacheState.activeTopic) {
            targetTopic = cacheState.activeTopic; // Use currently active topic
        }

        // Determine cache directory
        const targetCacheDir = getCacheDirectory(cacheState.cacheDir, targetTopic);

        // Validate cache system state and directory existence
        if (!cacheState.isInitialized) {
            return createErrorResponse(`Cache system not initialized. Use init_cache${targetTopic ? ` with topic "${targetTopic}"` : ''} first.`);
        }

        if (!existsSync(targetCacheDir)) {
            return createErrorResponse(`Cache directory not found: ${targetCacheDir}. ${targetTopic ? `Topic "${targetTopic}" may not be initialized.` : 'Cache may have been deleted.'} Use init_cache to recreate.`);
        }

        const timestamp = new Date().toISOString();

        // Update conversation_log.md with new progress summary
        const logPath = path.join(targetCacheDir, "conversation_log.md");
        const updateEntry = `

## Update: ${timestamp}${targetTopic ? ` (Topic: ${targetTopic})` : ''}
${conversationSummary}

`;
        
        await writeFile(
            logPath,
            updateEntry,
            'append'
        );

        // Update project state if technical details provided
        if (projectUpdate) {
            const projectPath = path.join(targetCacheDir, "current_project_state.md");
            const projectUpdateEntry = `

## Project Update: ${timestamp}${targetTopic ? ` (Topic: ${targetTopic})` : ''}
${projectUpdate}

`;
            await writeFile(
                projectPath,
                projectUpdateEntry,
                'append'
            );
        }

        // Update decisions log if important choices were made
        if (decisionsUpdate) {
            const decisionsPath = path.join(targetCacheDir, "decisions_made.md");
            const decisionEntry = `

## Decision Update: ${timestamp}${targetTopic ? ` (Topic: ${targetTopic})` : ''}
${decisionsUpdate}

`;
            await writeFile(
                decisionsPath,
                decisionEntry,
                'append'
            );
        }

        // Update next steps if priorities or action items changed
        if (nextStepsUpdate) {
            const stepsPath = path.join(targetCacheDir, "next_steps.md");
            const stepsEntry = `

## Next Steps Update: ${timestamp}${targetTopic ? ` (Topic: ${targetTopic})` : ''}
${nextStepsUpdate}

`;
            await writeFile(
                stepsPath,
                stepsEntry,
                'append'
            );
        }

        // Update session manifest if using topics
        if (targetTopic) {
            try {
                const manifest = await loadSessionManifest(cacheState.cacheDir);
                if (manifest.activeSessions[targetTopic]) {
                    manifest.activeSessions[targetTopic].lastUsed = timestamp;
                    await saveSessionManifest(cacheState.cacheDir, manifest);
                }
            } catch (error) {
                console.warn('Failed to update session manifest:', error);
            }
        }

        // Update internal state tracking
        cacheState.lastUpdate = new Date();
        if (targetTopic) {
            cacheState.activeTopic = targetTopic;
        }

        // Provide detailed feedback about what was updated
        return {
            content: [{
                type: "text",
                text: `✅ **Cache Updated Successfully!**

**Timestamp**: ${timestamp}
**Topic**: ${targetTopic || 'None (legacy mode)'}
**Cache Directory**: ${targetCacheDir}

**Updates Applied**:
- ✅ Conversation summary added
${projectUpdate ? '- ✅ Project state updated' : ''}
${decisionsUpdate ? '- ✅ Decisions documented' : ''}
${nextStepsUpdate ? '- ✅ Next steps updated' : ''}

**Cache Status**:
- **Last Update**: ${timestamp}
- **Topic Isolation**: ${targetTopic ? `Active - isolated memory for "${targetTopic}"` : 'Disabled - using legacy single cache'}
- **Auto-Update**: ${cacheState.autoUpdateEnabled ? 'Enabled' : 'Disabled'}

The cache now contains the latest conversation state and can be loaded in future sessions using:
\`load_cache(${targetTopic ? `{"topic": "${targetTopic}"}` : ''})\``
            }]
        };

    } catch (error) {
        return createErrorResponse(`Cache update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Load conversation context from cache files (Enhanced Topic Support)
 * 
 * Restores complete conversation state from cache files to enable seamless
 * session continuation. Supports topic-specific loading for isolated project memory.
 * Provides comprehensive context restoration with topic isolation.
 * 
 * Topic Support:
 * - Topic specified: Loads specific topic's cache files
 * - No topic: Lists available topics or loads legacy cache
 * - Topic validation: Ensures topic exists and has cache files
 * - Multiple topics: Can switch between different project contexts
 * 
 * Loading Strategy:
 * - Reads all cache files in sequence
 * - Handles missing files gracefully with error messages
 * - Presents content in organized sections for easy processing
 * - Updates internal cache state to reflect loaded configuration
 * - Provides comprehensive context restoration
 * - Maintains topic isolation throughout loading process
 * 
 * @param args - LoadCacheArgsSchema validated arguments
 * @param args.cacheDir - Base directory path containing cache files to load
 * @param args.topic - Optional topic specification for loading specific project context
 * @param args.useLegacy - Optional explicit legacy mode usage (bypasses topic recommendations)
 * @returns ServerResult with complete conversation context from all cache files
 */
export async function handleLoadCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = LoadCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { cacheDir: baseCacheDir, topic, useLegacy } = parsed.data;

        // If no topic specified, provide topic selection guidance
        if (!topic && !useLegacy) {
            // Check if there are available topics
            try {
                const manifest = await loadSessionManifest(baseCacheDir);
                const availableTopics = Object.keys(manifest.activeSessions);
                
                if (availableTopics.length > 0) {
                    // Multiple topics available - let user choose
                    let topicList = availableTopics.map(t => {
                        const session = manifest.activeSessions[t];
                        return `- **${t}**: ${session.projectName} (last used: ${new Date(session.lastUsed).toLocaleDateString()})`;
                    }).join('\n');

                    return {
                        content: [{
                            type: "text",
                            text: `🎯 **Multiple Topics Available**

Please specify which topic to load:

${topicList}

**Usage:**
\`\`\`
load_cache({"topic": "topic_name"})
\`\`\`

**Or use \`get_cache_topics()\` for more detailed topic information.**

${existsSync(baseCacheDir) ? '\n**Legacy Cache:** A non-topic cache also exists. Use `load_cache()` without topic to load it.' : ''}`
                        }]
                    };
                } else {
                    // No topics exist - encourage topic creation instead of legacy mode
                    if (existsSync(baseCacheDir)) {
                        return {
                            content: [{
                                type: "text",
                                text: `⚠️ **Legacy Cache Mode Detected**

You're about to load a legacy cache (no topic isolation). For better organization, **consider using topic-based caches** instead:

**Recommended Approach:**
\`\`\`
init_cache({
  "topic": "my_project_name",
  "projectName": "Descriptive Project Name",
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\`

**Benefits of Topics:**
- 🗂️ **Separate Memory**: Each project has isolated memory
- 🎯 **No Context Mixing**: WoW project won't mix with React project
- ⚡ **Better Organization**: Clean separation of different conversations
- 🔄 **Parallel Development**: Work on multiple projects simultaneously

**Continue with Legacy Cache:**
If you really want to load the legacy cache (not recommended):
\`\`\`
load_cache({"cacheDir": "${baseCacheDir}", "useLegacy": true})
\`\`\`

**Migration Option:**
Load legacy cache, then migrate it to a topic:
1. \`load_cache({"useLegacy": true})\`
2. \`init_cache({"topic": "migrated_project"})\`
3. \`update_cache({"topic": "migrated_project", "conversationSummary": "Migrated from legacy cache"})\``
                            }]
                        };
                    } else {
                        return {
                            content: [{
                                type: "text", 
                                text: `🎯 **No Cache Found - Let's Set Up Persistent Memory!**

No conversation cache exists yet. The cache system provides **unlimited conversation continuity** across Claude sessions.

**🚀 Quick Start:**
\`\`\`
init_cache({
  "topic": "my_project",
  "projectName": "My Project Name",
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\`

**✨ What You'll Get:**
- 🧠 **Persistent Memory**: I'll remember everything across sessions
- 🗂️ **Project Isolation**: Each topic keeps separate memory  
- ⚡ **Session Continuation**: Never lose context when hitting conversation limits
- 📚 **Cumulative Knowledge**: Build understanding over multiple conversations

**🎯 Then in Future Conversations:**
- \`load_cache({"topic": "my_project"})\` - Restore full context
- \`get_cache_topics()\` - See all your projects
- \`update_cache()\` - Save progress as we work

**Ready to enable unlimited conversation continuity?** 🚀`
                            }]
                        };
                    }
                }
            } catch (error) {
                // Manifest doesn't exist, check for legacy cache
                if (!existsSync(baseCacheDir)) {
                    return {
                        content: [{
                            type: "text",
                            text: `🎯 **Cache System Not Found**

**Directory**: \`${baseCacheDir}\`

No cache system exists yet. Let's set up persistent memory for unlimited conversation continuity!

**🚀 Quick Start:**
\`\`\`
init_cache({
  "topic": "my_project",
  "projectName": "My Project Name", 
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\`

**✨ Benefits:**
- 🧠 Persistent memory across sessions
- 🗂️ Topic-based project isolation
- ⚡ Never lose conversation context
- 📚 Cumulative knowledge building

**After initialization, use:** \`load_cache({"topic": "my_project"})\` to restore context in new conversations! 🚀`
                        }]
                    };
                }
                // Fall through to load legacy cache
            }
        }

        // Handle explicit legacy mode usage
        if (useLegacy && !topic) {
            if (!existsSync(baseCacheDir)) {
                return createErrorResponse(`Legacy cache directory not found: ${baseCacheDir}. Use init_cache to create a new cache system.`);
            }
            // Use base directory for legacy mode (no topic subdirectory)
            // Continue with legacy loading...
        }

        // Determine target cache directory
        const targetCacheDir = getCacheDirectory(baseCacheDir, topic);
        
        // Verify cache directory exists
        if (!existsSync(targetCacheDir)) {
            return createErrorResponse(`Cache directory not found: ${targetCacheDir}. ${topic ? `Topic "${topic}" may not be initialized.` : 'Cache directory missing.'} Use init_cache${topic ? ` with topic "${topic}"` : ''} to create it.`);
        }

        // Define cache files in logical loading order
        const cacheFiles = [
            "conversation_log.md",      // Main conversation history
            "current_project_state.md", // Technical project details
            "decisions_made.md",        // Key decisions and approaches
            "next_steps.md"            // Current priorities and actions
        ];

        // Build comprehensive context restoration message
        let loadedContent = `# 🔄 **Loading Conversation Context from Cache**

**Cache Directory**: ${targetCacheDir}
**Topic**: ${topic || 'None (legacy mode)'}
**Load Time**: ${new Date().toISOString()}

${topic ? `**Topic Isolation**: Active - this is isolated memory for "${topic}" project only` : '**Legacy Mode**: Single shared cache (consider using topics for multiple projects)'}

---

`;

        // Load each cache file and add to context restoration
        for (const filename of cacheFiles) {
            const filepath = path.join(targetCacheDir, filename);
            
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

${topic ? `**Topic Context**: You are now working on "${topic}" with completely isolated memory from other topics.

**Topic Management:**
- \`update_cache({"topic": "${topic}", ...})\` - Update this topic's cache
- \`get_cache_topics()\` - List all available topics
- \`load_cache({"topic": "other_topic"})\` - Switch to different topic` : `**Legacy Mode**: Using single shared cache.

**Consider Topic Isolation:**
- \`init_cache({"topic": "project_name"})\` - Start using topic-based isolation for better project organization`}

**Ready to continue where we left off!**

Use \`update_cache\` to add new progress as we continue working.
`;

        // Update internal cache state to reflect loaded configuration
        cacheState.cacheDir = baseCacheDir;
        cacheState.currentTopic = topic || null;
        cacheState.activeTopic = topic || null;
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
 * Enable or disable automatic cache updates (Enhanced Topic Support)
 * 
 * Configures the automatic cache update system that triggers cache updates
 * based on tool call frequency. Supports topic-specific auto-update settings
 * for independent management of different project contexts.
 * 
 * Topic Support:
 * - Topic specified: Configure auto-updates for specific topic only
 * - No topic + active topic: Configure auto-updates for currently active topic
 * - No topic + no active topic: Configure global auto-updates (legacy mode)
 * - Per-topic settings: Each topic can have different auto-update configurations
 * 
 * Auto-Update Mechanism:
 * - Tracks tool call count across conversation session
 * - Triggers cache updates at specified intervals
 * - Configurable update frequency for different use cases and topics
 * - Can be enabled/disabled dynamically during conversations
 * - Integrates with server request handler for automatic triggering
 * - Maintains topic isolation during auto-updates
 * 
 * @param args - AutoUpdateCacheArgsSchema validated arguments
 * @param args.enable - Boolean to enable/disable automatic updates
 * @param args.updateInterval - Optional number of tool calls between updates (default: 10)
 * @param args.topic - Optional topic specification for topic-specific auto-update settings
 * @returns ServerResult with auto-update configuration confirmation
 */
export async function handleAutoUpdateCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = AutoUpdateCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { enable, updateInterval, topic } = parsed.data;

        // Determine target topic for auto-update configuration
        let targetTopic = topic;
        if (!targetTopic && cacheState.activeTopic) {
            targetTopic = cacheState.activeTopic;
        }

        // Update auto-update configuration
        if (targetTopic) {
            // Topic-specific auto-update setting
            cacheState.topicAutoUpdateSettings.set(targetTopic, enable);
            
            // If this is the current active topic, also update global state
            if (targetTopic === cacheState.activeTopic) {
                cacheState.autoUpdateEnabled = enable;
            }
        } else {
            // Global auto-update setting (legacy mode)
            cacheState.autoUpdateEnabled = enable;
        }

        // Update interval setting
        if (updateInterval) {
            cacheState.updateInterval = updateInterval;
        }

        const status = enable ? "ENABLED" : "DISABLED";
        
        return {
            content: [{
                type: "text",
                text: `✅ **Auto-Cache ${status}**

**Target**: ${targetTopic ? `Topic "${targetTopic}"` : 'Global (legacy mode)'}
**Status**: ${status}
${enable ? `**Update Interval**: Every ${cacheState.updateInterval} tool calls` : ''}
**Current Tool Call Count**: ${cacheState.toolCallCount}

${targetTopic ? `**Topic-Specific Setting**: Auto-updates ${enable ? 'enabled' : 'disabled'} for "${targetTopic}" topic only.
${enable ? `Other topics are not affected by this setting.` : `This topic will not auto-update, but other topics may still auto-update if configured.`}` : `**Global Setting**: Auto-updates ${enable ? 'enabled' : 'disabled'} for ${cacheState.activeTopic ? 'current session' : 'legacy cache mode'}.`}

${enable ? 
`The cache will automatically update with conversation progress every ${cacheState.updateInterval} tool calls.` :
'Auto-updates are disabled. Use update_cache manually when needed.'}

${targetTopic ? `**Topic Management**: Use \`auto_update_cache\` with different topics to configure auto-updates per project.` : '**Consider Topics**: For multiple projects, use topic-based isolation for better auto-update control.'}`
            }]
        };

    } catch (error) {
        return createErrorResponse(`Auto-update configuration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get current cache system status (Enhanced Topic Support)
 * 
 * Provides comprehensive information about the current state of the conversation
 * cache system including configuration, file status, and usage statistics.
 * Supports both topic-specific and global status reporting for complete visibility.
 * 
 * Status Reporting:
 * - Topic specified: Detailed status for specific topic
 * - No topic: Global status + available topics overview  
 * - Configuration details: Auto-update settings, directories, permissions
 * - File status: Cache files, sizes, last update times
 * - Usage statistics: Tool call counts, session activity
 * - Health indicators: Directory existence, permission status, warnings
 * 
 * @param args - GetCacheStatusArgsSchema validated arguments
 * @param args.topic - Optional topic specification for topic-specific status
 * @returns ServerResult with comprehensive cache system status report
 */
export async function handleGetCacheStatus(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = GetCacheStatusArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { topic } = parsed.data;

        if (topic) {
            // Topic-specific status report
            const topicCacheDir = getCacheDirectory(cacheState.cacheDir, topic);
            const topicExists = existsSync(topicCacheDir);
            const topicAutoUpdate = cacheState.topicAutoUpdateSettings.get(topic) || false;

            let topicInfo = "";
            if (topicExists) {
                try {
                    const manifest = await loadSessionManifest(cacheState.cacheDir);
                    const sessionInfo = manifest.activeSessions[topic];
                    if (sessionInfo) {
                        topicInfo = `
**Topic Details**:
- **Project Name**: ${sessionInfo.projectName}
- **Created**: ${new Date(sessionInfo.createdAt).toLocaleString()}
- **Last Used**: ${new Date(sessionInfo.lastUsed).toLocaleString()}
- **Session Type**: ${sessionInfo.sessionOnly ? 'Temporary Session Cache' : 'Persistent Project Memory'}
${sessionInfo.autoCleanupAfterDays ? `- **Auto-Cleanup**: After ${sessionInfo.autoCleanupAfterDays} days` : ''}`;
                    }
                } catch (error) {
                    topicInfo = "\n**Topic Details**: Unable to load session manifest";
                }
            }

            const status = `# 📊 **Cache System Status - Topic: ${topic}**

## Topic Configuration:
- **Topic Directory**: ${topicCacheDir}
- **Exists**: ${topicExists ? '✅ Yes' : '❌ No'}
- **Auto-Update**: ${topicAutoUpdate ? '✅ Enabled' : '❌ Disabled'}
- **Update Interval**: Every ${cacheState.updateInterval} tool calls
- **Currently Active**: ${cacheState.activeTopic === topic ? '✅ Yes' : '❌ No'}

${topicInfo}

## Cache Files:
${topicExists ? `
- 📄 conversation_log.md
- 📄 current_project_state.md  
- 📄 decisions_made.md
- 📄 next_steps.md
- 📄 cache_protocol.md
` : '- No cache files (topic not initialized)'}

## Available Commands:
- \`load_cache({"topic": "${topic}"})\`: Load this topic's context
- \`update_cache({"topic": "${topic}", ...})\`: Update this topic's cache
- \`auto_update_cache({"topic": "${topic}", "enable": true/false})\`: Configure auto-updates
- \`archive_cache({"topic": "${topic}", "confirmArchive": true})\`: Archive when complete

${!topicExists ? `⚠️ **Note**: Topic "${topic}" is not initialized. Use \`init_cache({"topic": "${topic}"})\` to create it.` : ''}
`;

            return {
                content: [{
                    type: "text",
                    text: status
                }]
            };
        } else {
            // Auto-initialization guidance for new users
            const cacheExists = existsSync(cacheState.cacheDir);
            if (!cacheExists) {
                return {
                    content: [{
                        type: "text",
                        text: `🎯 **Welcome to the Conversation Cache System!**

**No cache detected** - looks like you're new here! The cache system provides **unlimited conversation continuity** across Claude sessions.

**🚀 Quick Start (Recommended):**
\`\`\`
init_cache({
  "topic": "my_project", 
  "projectName": "My Project Name",
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\`

**✨ What You'll Get:**
- 🧠 **Persistent Memory**: I'll remember everything across sessions
- 🗂️ **Project Isolation**: Each topic keeps separate memory
- ⚡ **Session Continuation**: Never lose context when hitting conversation limits
- 📚 **Cumulative Knowledge**: Build understanding over multiple conversations

**💡 Example Topics:**
- \`"coding_project"\` - For software development work
- \`"research"\` - For research and analysis projects  
- \`"wow_backup"\` - For your WoW character backup system
- \`"learning"\` - For educational conversations

**🎯 After Initialization:**
- Use \`load_cache({"topic": "my_project"})\` in new conversations to restore context
- Use \`update_cache()\` to save progress as we work
- Use \`get_cache_topics()\` to see all your projects

**Ready to enable unlimited conversation continuity?** Just run the init_cache command above! 🚀`
                    }]
                };
            }

            // Global status report with topics overview
            let topicsOverview = "";
            let availableTopics: string[] = [];

            try {
                if (existsSync(cacheState.cacheDir)) {
                    const manifest = await loadSessionManifest(cacheState.cacheDir);
                    availableTopics = Object.keys(manifest.activeSessions);
                    
                    if (availableTopics.length > 0) {
                        topicsOverview = `
## Available Topics:
${availableTopics.map(t => {
    const session = manifest.activeSessions[t];
    const autoUpdate = cacheState.topicAutoUpdateSettings.get(t) ? '🔄' : '⏸️';
    return `- ${autoUpdate} **${t}**: ${session.projectName} (${new Date(session.lastUsed).toLocaleDateString()})`;
}).join('\n')}

**Legend**: 🔄 = Auto-update enabled, ⏸️ = Auto-update disabled
`;
                    } else {
                        topicsOverview = `
## Available Topics:
- No topics found
- Use \`init_cache({"topic": "topic_name"})\` to create topic-isolated caches
`;
                    }
                }
            } catch (error) {
                topicsOverview = `
## Available Topics:
- Unable to load topic information
`;
            }

            const legacyCacheExists = existsSync(getCacheDirectory(cacheState.cacheDir));

            const status = `# 📊 **Cache System Status - Global Overview**

## Global Configuration:
- **Initialized**: ${cacheState.isInitialized ? '✅ Yes' : '❌ No'}
- **Base Cache Directory**: ${cacheState.cacheDir}
- **Current Topic**: ${cacheState.activeTopic || 'None (legacy mode)'}
- **Global Auto-Update**: ${cacheState.autoUpdateEnabled ? '✅ Enabled' : '❌ Disabled'}
- **Update Interval**: Every ${cacheState.updateInterval} tool calls
- **Tool Call Count**: ${cacheState.toolCallCount}

## System Status:
- **Last Update**: ${cacheState.lastUpdate ? cacheState.lastUpdate.toISOString() : 'Never'}
- **Create Permission**: ${cacheState.hasCreatePermission ? '✅ Granted' : '❌ Not granted'}
- **Legacy Cache**: ${legacyCacheExists ? '✅ Exists' : '❌ Not found'}

${topicsOverview}

## Available Commands:
- \`init_cache({"topic": "name"})\`: Create new topic-isolated cache
- \`get_cache_topics()\`: List all topics with detailed information
- \`get_cache_status({"topic": "name"})\`: Get specific topic status
- \`load_cache({"topic": "name"})\`: Load specific topic context
- \`archive_cache({"topic": "name"})\`: Archive completed topics

## Topic System Benefits:
✅ **Isolation**: Each topic has completely separate memory
✅ **No Mixing**: WoW project won't mix with React project contexts  
✅ **Parallel Work**: Multiple topics can be active simultaneously
✅ **Persistent Memory**: Each topic builds cumulative knowledge over time

${availableTopics.length === 0 ? `
⭐ **Get Started**: Use \`init_cache({"topic": "my_project"})\` to create your first topic-isolated cache!
` : ''}

${cacheState.autoUpdateEnabled && !cacheState.isInitialized ? 
'⚠️ **Note**: Auto-update is enabled but cache is not initialized. Use init_cache first.' : ''}
`;

            return {
                content: [{
                    type: "text",
                    text: status
                }]
            };
        }

    } catch (error) {
        return createErrorResponse(`Status check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get list of all available cache topics (New Topic Management Feature)
 * 
 * Provides comprehensive information about all available cache topics including
 * session details, last usage, project names, and auto-update status.
 * Enables users to discover and manage multiple topic-isolated caches.
 * 
 * @param args - GetCacheTopicsArgsSchema validated arguments
 * @param args.cacheDir - Base cache directory to scan for topics
 * @returns ServerResult with detailed topic listing and management information
 */
export async function handleGetCacheTopics(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = GetCacheTopicsArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { cacheDir } = parsed.data;

        // Auto-initialization guidance for new users
        if (!existsSync(cacheDir)) {
            return {
                content: [{
                    type: "text",
                    text: `🎯 **Welcome to Topic-Based Memory System!**

**No cache found** - Let's set up unlimited conversation continuity!

**🚀 Quick Start:**
\`\`\`
init_cache({
  "topic": "my_project",
  "projectName": "My Project Name", 
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\`

**✨ Benefits of Topic-Based Caches:**
- 🗂️ **Project Isolation**: Each topic has separate memory
- 🎯 **No Context Mixing**: WoW project won't mix with React project  
- 🔄 **Parallel Development**: Work on multiple projects simultaneously
- 📚 **Cumulative Knowledge**: Each topic builds understanding over time

**💡 Popular Topic Examples:**
- \`"coding_project"\` - Software development work
- \`"research_analysis"\` - Research and data analysis
- \`"wow_character_backup"\` - Gaming project development
- \`"learning_ai"\` - AI and ML learning sessions

**🎯 After Creating Topics:**
- \`get_cache_topics()\` - View all your project topics
- \`load_cache({"topic": "my_project"})\` - Switch to specific project
- \`update_cache({"topic": "my_project", ...})\` - Save progress

**Ready to create your first topic?** Run the init_cache command above! 🚀`
                }]
            };
        }

        let topicsList = "";
        let legacyCacheInfo = "";

        try {
            // Load session manifest for topic information
            const manifest = await loadSessionManifest(cacheDir);
            const topics = Object.keys(manifest.activeSessions);

            if (topics.length > 0) {
                topicsList = `## 📁 **Available Topics**: ${topics.length} found

${topics.map(topic => {
                    const session = manifest.activeSessions[topic];
                    const topicDir = getCacheDirectory(cacheDir, topic);
                    const exists = existsSync(topicDir);
                    const autoUpdate = cacheState.topicAutoUpdateSettings.get(topic);
                    const isActive = cacheState.activeTopic === topic;
                    
                    return `### 📋 **${topic}**
- **Project**: ${session.projectName}
- **Status**: ${exists ? '✅ Active' : '❌ Missing'} ${isActive ? '(Currently Loaded)' : ''}
- **Created**: ${new Date(session.createdAt).toLocaleDateString()}
- **Last Used**: ${new Date(session.lastUsed).toLocaleDateString()}
- **Type**: ${session.sessionOnly ? '🕐 Temporary Session' : '💾 Persistent Memory'}
- **Auto-Update**: ${autoUpdate ? '🔄 Enabled' : '⏸️ Disabled'}
${session.autoCleanupAfterDays ? `- **Auto-Cleanup**: After ${session.autoCleanupAfterDays} days` : ''}
- **Directory**: \`${topicDir}\`

**Actions**:
\`\`\`
load_cache({"topic": "${topic}"})           # Load this topic's context
update_cache({"topic": "${topic}", ...})    # Update this topic's cache  
get_cache_status({"topic": "${topic}"})     # Detailed status for this topic
\`\`\``;
                }).join('\n\n')}`;
            } else {
                topicsList = `## 📁 **Available Topics**: None found

No topic-isolated caches have been created yet.

**Create Your First Topic**:
\`\`\`
init_cache({
  "topic": "my_project_name",
  "projectName": "Descriptive Project Name", 
  "confirmCreate": true,
  "understoodGrowth": true
})
\`\`\``;
            }
        } catch (error) {
            topicsList = `## 📁 **Available Topics**: Unable to load

Error reading session manifest: ${error instanceof Error ? error.message : String(error)}

Topics may exist but cannot be enumerated. Check directory permissions.`;
        }

        // Check for legacy cache (non-topic cache in base directory)
        const legacyCacheFiles = ["conversation_log.md", "current_project_state.md", "decisions_made.md", "next_steps.md"];
        const hasLegacyCache = legacyCacheFiles.some(file => existsSync(path.join(cacheDir, file)));

        if (hasLegacyCache) {
            legacyCacheInfo = `

## 📄 **Legacy Cache**: Found

A non-topic cache exists in the base directory. This is from before topic isolation was implemented.

**Directory**: \`${cacheDir}\`
**Load Command**: \`load_cache()\` (without topic parameter)

**Consider Migration**: You may want to migrate this to a topic-based cache:
\`\`\`
# 1. Load legacy cache
load_cache()

# 2. Create new topic with same content  
init_cache({"topic": "legacy_project", "confirmCreate": true, "understoodGrowth": true})

# 3. Update with legacy content
update_cache({"topic": "legacy_project", "conversationSummary": "Migrated from legacy cache"})
\`\`\``;
        }

        const result = `# 🗂️ **Cache Topics Overview**

**Base Directory**: ${cacheDir}
**Active Topic**: ${cacheState.activeTopic || 'None'}
**Global Auto-Update**: ${cacheState.autoUpdateEnabled ? '🔄 Enabled' : '⏸️ Disabled'}

${topicsList}

${legacyCacheInfo}

## 🎯 **Topic System Benefits**

**📍 Complete Isolation**: Each topic has separate memory - WoW project won't mix with React project
**🔄 Persistent Memory**: Each topic builds cumulative knowledge over time  
**⚡ Session Continuation**: Hit conversation limit → new conversation → load topic → continue exactly where you left off
**🎛️ Independent Settings**: Each topic can have different auto-update settings
**📈 Parallel Development**: Work on multiple projects simultaneously

## 📋 **Topic Management Commands**

\`\`\`
get_cache_topics()                    # This command - list all topics
init_cache({"topic": "name"})         # Create new topic-isolated cache  
load_cache({"topic": "name"})         # Load specific topic context
get_cache_status({"topic": "name"})   # Detailed status for specific topic
archive_cache({"topic": "name"})      # Archive completed topics
cleanup_cache()                       # Clean up old/unused cache files
\`\`\`

Ready to work with topic-isolated persistent memory! 🚀`;

        return {
            content: [{
                type: "text",
                text: result
            }]
        };

    } catch (error) {
        return createErrorResponse(`Failed to get cache topics: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Archive completed cache topic (New Topic Management Feature)
 * 
 * Archives a completed topic by marking it as archived in the session manifest
 * while preserving all cache files for potential future reference.
 * Provides clean topic management for completed projects.
 * 
 * @param args - ArchiveCacheArgsSchema validated arguments
 * @param args.topic - Topic name to archive  
 * @param args.cacheDir - Base cache directory containing the topic
 * @param args.confirmArchive - Required explicit confirmation for archiving
 * @returns ServerResult with archival confirmation and instructions
 */
export async function handleArchiveCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = ArchiveCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { topic, cacheDir, confirmArchive } = parsed.data;

        // Require explicit confirmation
        if (!confirmArchive) {
            return {
                content: [{
                    type: "text",
                    text: `⚠️ **Archive Confirmation Required**

To archive topic "${topic}", you must explicitly confirm:

\`\`\`
archive_cache({
  "topic": "${topic}",
  "confirmArchive": true
})
\`\`\`

**What archiving does:**
- ✅ Preserves all cache files (no data loss)
- ✅ Marks topic as archived in session manifest
- ✅ Removes from active topics list
- ✅ Cache files remain accessible for future reference

**Note**: Archived topics can still be loaded with \`load_cache({"topic": "${topic}"})\` if needed.`
                }]
            };
        }

        const topicCacheDir = getCacheDirectory(cacheDir, topic);

        // Verify topic exists
        if (!existsSync(topicCacheDir)) {
            return createErrorResponse(`Topic "${topic}" not found. Directory does not exist: ${topicCacheDir}`);
        }

        try {
            // Load and update session manifest
            const manifest = await loadSessionManifest(cacheDir);
            
            if (!manifest.activeSessions[topic]) {
                return createErrorResponse(`Topic "${topic}" not found in session manifest. It may have been created before topic tracking was implemented.`);
            }

            // Move to archived sessions
            if (!manifest.archivedSessions) {
                manifest.archivedSessions = {};
            }

            const sessionInfo = manifest.activeSessions[topic];
            const archivedSessionInfo = {
                ...sessionInfo,
                archivedAt: new Date().toISOString()
            };
            
            manifest.archivedSessions[topic] = archivedSessionInfo;
            delete manifest.activeSessions[topic];

            await saveSessionManifest(cacheDir, manifest);

            // Remove from auto-update settings
            cacheState.topicAutoUpdateSettings.delete(topic);

            // Clear from active topic if currently loaded
            if (cacheState.activeTopic === topic) {
                cacheState.activeTopic = null;
                cacheState.autoUpdateEnabled = false;
            }

            return {
                content: [{
                    type: "text",
                    text: `✅ **Topic Archived Successfully**

**Topic**: ${topic}
**Project**: ${archivedSessionInfo.projectName}
**Archived**: ${new Date().toISOString()}

**What happened**:
- ✅ Topic marked as archived in session manifest
- ✅ Removed from active topics list  
- ✅ Auto-update settings cleared
- ✅ All cache files preserved in: \`${topicCacheDir}\`

**Files preserved**:
- 📄 conversation_log.md (complete conversation history)
- 📄 current_project_state.md (final project state)
- 📄 decisions_made.md (all decisions made)
- 📄 next_steps.md (final priorities)

**Future access**: 
The archived topic can still be loaded if needed:
\`\`\`
load_cache({"topic": "${topic}"})
\`\`\`

**View remaining topics**: \`get_cache_topics()\``
                    }]
                };

        } catch (error) {
            return createErrorResponse(`Failed to archive topic: ${error instanceof Error ? error.message : String(error)}`);
        }

    } catch (error) {
        return createErrorResponse(`Archive operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Clean up old cache files and sessions (New Topic Management Feature)
 * 
 * Performs maintenance on the cache system by removing old session caches
 * based on age and usage criteria. Helps prevent cache directory bloat
 * while preserving recent and active project data.
 * 
 * @param args - CleanupCacheArgsSchema validated arguments
 * @param args.cacheDir - Base cache directory to clean up
 * @param args.cleanupAfterDays - Remove sessions older than this many days (default: 30)
 * @param args.maxSessions - Keep only this many most recent sessions (default: 10)
 * @param args.confirmCleanup - Required explicit confirmation for cleanup
 * @returns ServerResult with cleanup summary and actions taken
 */
export async function handleCleanupCache(args: unknown): Promise<ServerResult> {
    try {
        // Validate input parameters
        const parsed = CleanupCacheArgsSchema.safeParse(args);
        if (!parsed.success) {
            return createErrorResponse(`Invalid arguments: ${parsed.error}`);
        }

        const { cacheDir, cleanupAfterDays, maxSessions, confirmCleanup } = parsed.data;

        // Require explicit confirmation
        if (!confirmCleanup) {
            return {
                content: [{
                    type: "text",
                    text: `⚠️ **Cleanup Confirmation Required**

Cache cleanup will remove old topic sessions based on:
- **Age limit**: Remove topics older than ${cleanupAfterDays} days
- **Count limit**: Keep only ${maxSessions} most recent topics

**To proceed with cleanup:**
\`\`\`
cleanup_cache({
  "cleanupAfterDays": ${cleanupAfterDays},
  "maxSessions": ${maxSessions},
  "confirmCleanup": true
})
\`\`\`

**What will be cleaned**:
- 🗑️ Topic directories older than ${cleanupAfterDays} days
- 🗑️ Excess topics beyond ${maxSessions} most recent
- ✅ Active and recently used topics will be preserved

**Data Loss Warning**: This action permanently deletes cache files and cannot be undone.`
                    }]
                };
        }

        if (!existsSync(cacheDir)) {
            return createErrorResponse(`Cache directory not found: ${cacheDir}`);
        }

        try {
            const manifest = await loadSessionManifest(cacheDir);
            const now = new Date();
            const cutoffDate = new Date(now.getTime() - (cleanupAfterDays * 24 * 60 * 60 * 1000));

            let cleanedTopics: string[] = [];
            let preservedTopics: string[] = [];

            // Check active sessions for cleanup
            const activeSessions = Object.entries(manifest.activeSessions);
            
            // Sort by last used date (most recent first)
            activeSessions.sort(([, a], [, b]) => 
                new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
            );

            for (let i = 0; i < activeSessions.length; i++) {
                const [topic, sessionInfo] = activeSessions[i];
                const lastUsed = new Date(sessionInfo.lastUsed);
                const topicDir = getCacheDirectory(cacheDir, topic);

                // Determine if topic should be cleaned up
                const tooOld = lastUsed < cutoffDate;
                const excessCount = i >= maxSessions;
                const isCurrentlyActive = cacheState.activeTopic === topic;

                if ((tooOld || excessCount) && !isCurrentlyActive) {
                    // Clean up this topic
                    try {
                        if (existsSync(topicDir)) {
                            // Note: We can't actually delete directories with current tools
                            // Mark for manual cleanup instead
                            cleanedTopics.push(`${topic} (${sessionInfo.projectName}) - Directory: ${topicDir}`);
                        }
                        
                        // Remove from manifest
                        delete manifest.activeSessions[topic];
                        
                        // Remove auto-update settings
                        cacheState.topicAutoUpdateSettings.delete(topic);
                        
                    } catch (error) {
                        console.warn(`Failed to clean up topic ${topic}:`, error);
                    }
                } else {
                    preservedTopics.push(`${topic} (${sessionInfo.projectName})`);
                }
            }

            // Save updated manifest
            await saveSessionManifest(cacheDir, manifest);

            return {
                content: [{
                    type: "text",
                    text: `✅ **Cache Cleanup Complete**

**Cleanup Parameters**:
- **Age Limit**: ${cleanupAfterDays} days
- **Count Limit**: ${maxSessions} topics
- **Cutoff Date**: ${cutoffDate.toLocaleDateString()}

**📊 Cleanup Results**:

**🗑️ Topics Marked for Cleanup** (${cleanedTopics.length}):
${cleanedTopics.length > 0 ? cleanedTopics.map(t => `- ${t}`).join('\n') : '- None'}

**✅ Topics Preserved** (${preservedTopics.length}):
${preservedTopics.length > 0 ? preservedTopics.map(t => `- ${t}`).join('\n') : '- None'}

${cleanedTopics.length > 0 ? `
**⚠️ Manual Action Required**:
Cache directories were marked for cleanup but must be manually deleted:

${cleanedTopics.map(t => {
    const dir = t.split('Directory: ')[1];
    return `\`\`\`\nrmdir /s "${dir}"\n\`\`\``;
}).join('\n')}

**Note**: Directory deletion requires manual action for safety.` : ''}

**Current Status**: ${manifest.activeSessions ? Object.keys(manifest.activeSessions).length : 0} active topics remaining

Use \`get_cache_topics()\` to view remaining active topics.`
                    }]
                };

        } catch (error) {
            return createErrorResponse(`Failed to perform cleanup: ${error instanceof Error ? error.message : String(error)}`);
        }

    } catch (error) {
        return createErrorResponse(`Cleanup operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Increment tool call counter and trigger auto-update if needed (Enhanced Topic Support)
 * 
 * This function is called by the server request handler for each tool call
 * to maintain the tool call counter and trigger automatic cache updates
 * when the configured interval is reached. Enhanced with topic support
 * for independent auto-update management per topic.
 * 
 * Auto-Update Logic:
 * - Increments global tool call counter on each invocation
 * - Checks topic-specific auto-update settings when available  
 * - Falls back to global auto-update settings for legacy mode
 * - Triggers automatic cache update with current progress summary
 * - Handles auto-update errors gracefully without disrupting main flow
 * - Maintains topic isolation during auto-update process
 * 
 * Topic Integration:
 * - Uses currently active topic for auto-updates when available
 * - Respects per-topic auto-update settings
 * - Falls back to global settings when no topic is active
 * - Preserves topic context during auto-update operations
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
    
    // Determine if auto-update should trigger
    let shouldAutoUpdate = false;
    let targetTopic: string | null = null;

    if (cacheState.activeTopic) {
        // Check topic-specific auto-update setting
        const topicAutoUpdate = cacheState.topicAutoUpdateSettings.get(cacheState.activeTopic);
        shouldAutoUpdate = topicAutoUpdate === true;
        targetTopic = cacheState.activeTopic;
    } else {
        // Use global auto-update setting (legacy mode)
        shouldAutoUpdate = cacheState.autoUpdateEnabled;
    }

    // Check if auto-update should trigger based on current configuration
    if (shouldAutoUpdate && 
        cacheState.isInitialized && 
        cacheState.toolCallCount % cacheState.updateInterval === 0) {
        
        // Trigger auto-update with standardized progress message
        // Include topic information if available
        const autoUpdateArgs = {
            conversationSummary: `Auto-update triggered after ${cacheState.toolCallCount} tool calls at ${new Date().toISOString()}`,
            ...(targetTopic && { topic: targetTopic })
        };

        // Run asynchronously to avoid blocking the main tool call
        handleUpdateCache(autoUpdateArgs).catch(error => {
            // Log auto-update errors but don't disrupt main conversation flow
            console.error(`Auto-update failed${targetTopic ? ` for topic "${targetTopic}"` : ''}:`, error);
        });
    }
}
