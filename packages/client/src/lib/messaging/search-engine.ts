import * as lunr from 'lunr';
import { Message } from './offline-storage';

interface SearchDocument {
  id: string;
  messageId: string;
  conversationId: string;
  content: string;
  messageType: string;
  senderId: string;
  recipientId: string;
  timestamp: number;
  fileName?: string;
  tags?: string[];
}

interface SearchResult {
  messageId: string;
  score: number;
  matches: lunr.MatchData;
}

interface SearchOptions {
  conversationId?: string;
  messageType?: string;
  senderId?: string;
  recipientId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  fuzzy?: boolean;
}

class SearchEngine {
  private index: lunr.Index | null = null;
  private documents: Map<string, SearchDocument> = new Map();
  private isInitialized = false;
  private indexQueue: SearchDocument[] = [];
  private rebuilding = false;

  async init(): Promise<void> {
    try {
      await this.buildInitialIndex();
      this.isInitialized = true;
      console.log('Search engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize search engine:', error);
      throw error;
    }
  }

  private async buildInitialIndex(): Promise<void> {
    this.index = lunr(function() {
      // Configure the index
      this.ref('id');
      
      // Define searchable fields with different boosts
      this.field('content', { boost: 10 }); // Highest priority for message content
      this.field('fileName', { boost: 5 }); // High priority for file names
      this.field('messageType', { boost: 2 });
      this.field('tags', { boost: 3 });
      this.field('senderId');
      this.field('recipientId');
      this.field('conversationId');

      // Add pipeline functions for better text processing
      this.pipeline.add(
        lunr.trimmer,
        lunr.stopWordFilter,
        lunr.stemmer
      );

      // Search pipeline (used when searching)
      this.searchPipeline.add(
        lunr.stemmer
      );
    });

    console.log('Initial search index built');
  }

  async indexMessage(message: Message): Promise<void> {
    const document = this.messageToSearchDocument(message);
    
    if (!this.isInitialized) {
      // Queue the document for indexing when initialized
      this.indexQueue.push(document);
      return;
    }

    this.documents.set(document.messageId, document);
    
    // Rebuild index if we have significant changes
    if (this.documents.size % 100 === 0) {
      await this.rebuildIndex();
    }
  }

  async updateMessage(message: Message): Promise<void> {
    const document = this.messageToSearchDocument(message);
    this.documents.set(document.messageId, document);
    
    // For updates, we need to rebuild the index
    await this.rebuildIndex();
  }

  async removeMessage(messageId: string): Promise<void> {
    this.documents.delete(messageId);
    
    // Rebuild index after removal
    await this.rebuildIndex();
  }

  async search(query: string, options: SearchOptions = {}): Promise<string[]> {
    if (!this.index || !this.isInitialized) {
      console.warn('Search engine not initialized');
      return [];
    }

    if (!query.trim()) {
      return [];
    }

    try {
      // Process the query
      const processedQuery = this.processQuery(query, options);
      
      // Perform the search
      const results = this.index.search(processedQuery);
      
      // Filter and sort results
      const filteredResults = this.filterResults(results, options);
      
      // Extract message IDs
      return filteredResults
        .slice(0, options.limit || 50)
        .map(result => {
          const doc = this.documents.get(result.ref);
          return doc ? doc.messageId : result.ref;
        })
        .filter(Boolean);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  async searchAdvanced(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.index || !this.isInitialized) {
      return [];
    }

    try {
      const processedQuery = this.processQuery(query, options);
      const results = this.index.search(processedQuery);
      const filteredResults = this.filterResults(results, options);

      return filteredResults
        .slice(0, options.limit || 50)
        .map(result => {
          const doc = this.documents.get(result.ref);
          return {
            messageId: doc ? doc.messageId : result.ref,
            score: result.score,
            matches: result.matchData
          };
        });
    } catch (error) {
      console.error('Advanced search error:', error);
      return [];
    }
  }

  async searchSuggestions(query: string, limit = 5): Promise<string[]> {
    if (!this.index || !query.trim()) {
      return [];
    }

    // Get partial matches for autocomplete
    const fuzzyQuery = query.split(' ')
      .map(term => term.length > 2 ? `${term}*` : term)
      .join(' ');

    try {
      const results = this.index.search(fuzzyQuery);
      const suggestions = new Set<string>();

      results.slice(0, limit * 3).forEach(result => {
        const doc = this.documents.get(result.ref);
        if (doc) {
          // Extract relevant terms from content
          const words = doc.content.toLowerCase().split(/\s+/);
          const queryTerms = query.toLowerCase().split(/\s+/);
          
          words.forEach(word => {
            if (word.length > 2 && 
                queryTerms.some(term => word.startsWith(term) && word !== term)) {
              suggestions.add(word);
            }
          });
        }
      });

      return Array.from(suggestions).slice(0, limit);
    } catch (error) {
      console.error('Search suggestions error:', error);
      return [];
    }
  }

  async getSearchStats(): Promise<{
    totalDocuments: number;
    indexSize: number;
    lastRebuild: Date | null;
  }> {
    return {
      totalDocuments: this.documents.size,
      indexSize: this.index ? Object.keys(this.index.invertedIndex).length : 0,
      lastRebuild: null // TODO: Track last rebuild time
    };
  }

  private messageToSearchDocument(message: Message): SearchDocument {
    // Extract searchable content
    let content = message.content || '';
    let fileName = '';
    let tags: string[] = [];

    // Add metadata to searchable content
    if (message.metadata) {
      if (message.metadata.fileName) {
        fileName = message.metadata.fileName;
        content += ' ' + fileName;
      }
      
      // Add other metadata as tags
      if (message.metadata.mimeType) {
        tags.push(message.metadata.mimeType.split('/')[0]); // e.g., 'image' from 'image/jpeg'
      }
    }

    // Add message type as a tag
    tags.push(message.messageType);

    return {
      id: message.messageId,
      messageId: message.messageId,
      conversationId: message.conversationId,
      content: content.toLowerCase(),
      messageType: message.messageType,
      senderId: message.senderId,
      recipientId: message.recipientId,
      timestamp: new Date(message.timestamp).getTime(),
      fileName,
      tags
    };
  }

  private processQuery(query: string, options: SearchOptions): string {
    let processedQuery = query.trim();

    // Handle different search patterns
    if (options.fuzzy && !processedQuery.includes('~')) {
      // Add fuzzy search to each term
      processedQuery = processedQuery.split(' ')
        .map(term => term.length > 2 ? `${term}~1` : term)
        .join(' ');
    }

    // Add field-specific searches
    const fieldQueries: string[] = [];

    if (options.messageType) {
      fieldQueries.push(`messageType:${options.messageType}`);
    }

    if (options.senderId) {
      fieldQueries.push(`senderId:${options.senderId}`);
    }

    if (options.recipientId) {
      fieldQueries.push(`recipientId:${options.recipientId}`);
    }

    if (options.conversationId) {
      fieldQueries.push(`conversationId:${options.conversationId}`);
    }

    // Combine queries
    if (fieldQueries.length > 0) {
      processedQuery = `${processedQuery} ${fieldQueries.join(' ')}`;
    }

    return processedQuery;
  }

  private filterResults(results: lunr.Index.Result[], options: SearchOptions): lunr.Index.Result[] {
    return results.filter(result => {
      const doc = this.documents.get(result.ref);
      if (!doc) return false;

      // Filter by conversation
      if (options.conversationId && doc.conversationId !== options.conversationId) {
        return false;
      }

      // Filter by message type
      if (options.messageType && doc.messageType !== options.messageType) {
        return false;
      }

      // Filter by sender
      if (options.senderId && doc.senderId !== options.senderId) {
        return false;
      }

      // Filter by recipient
      if (options.recipientId && doc.recipientId !== options.recipientId) {
        return false;
      }

      // Filter by date range
      if (options.dateRange) {
        const messageTime = doc.timestamp;
        const start = options.dateRange.start.getTime();
        const end = options.dateRange.end.getTime();
        
        if (messageTime < start || messageTime > end) {
          return false;
        }
      }

      return true;
    });
  }

  private async rebuildIndex(): Promise<void> {
    if (this.rebuilding) {
      return;
    }

    this.rebuilding = true;

    try {
      // Add queued documents
      for (const doc of this.indexQueue) {
        this.documents.set(doc.messageId, doc);
      }
      this.indexQueue = [];

      // Rebuild the index with all documents
      this.index = lunr(function() {
        this.ref('id');
        this.field('content', { boost: 10 });
        this.field('fileName', { boost: 5 });
        this.field('messageType', { boost: 2 });
        this.field('tags', { boost: 3 });
        this.field('senderId');
        this.field('recipientId');
        this.field('conversationId');

        this.pipeline.add(
          lunr.trimmer,
          lunr.stopWordFilter,
          lunr.stemmer
        );

        this.searchPipeline.add(lunr.stemmer);

        // Add all documents
        for (const doc of this.documents.values()) {
          this.add(doc);
        }
      }.bind(this));

      console.log(`Search index rebuilt with ${this.documents.size} documents`);
    } catch (error) {
      console.error('Error rebuilding search index:', error);
    } finally {
      this.rebuilding = false;
    }
  }

  // Cleanup and maintenance
  async clearIndex(): Promise<void> {
    this.documents.clear();
    this.indexQueue = [];
    await this.buildInitialIndex();
  }

  async exportIndex(): Promise<object> {
    return {
      documents: Array.from(this.documents.entries()),
      indexData: this.index ? this.index.toJSON() : null
    };
  }

  async importIndex(data: { documents: [string, SearchDocument][]; indexData: any }): Promise<void> {
    try {
      // Restore documents
      this.documents = new Map(data.documents);
      
      // Restore index
      if (data.indexData) {
        this.index = lunr.Index.load(data.indexData);
      } else {
        await this.rebuildIndex();
      }
      
      this.isInitialized = true;
      console.log(`Search index imported with ${this.documents.size} documents`);
    } catch (error) {
      console.error('Error importing search index:', error);
      await this.buildInitialIndex();
    }
  }
}

export default SearchEngine;
export type { SearchDocument, SearchResult, SearchOptions };
