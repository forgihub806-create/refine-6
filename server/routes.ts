import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { type IStorage } from "./storage.ts";
import { insertMediaItemSchema, insertTagSchema, insertCategorySchema, type MediaSearchParams, type InsertMediaItem } from "@shared/schema.ts";
import { z } from "zod";
import { WebSocketServer } from 'ws';

import { getSingleFileInfo } from "./new-scraper.ts";
import { teraboxFastProxy } from "./api-proxies/terabox-fast.ts";
import { iteraplayProxy } from "./api-proxies/iteraplay.ts";
import { playerteraProxy } from "./api-proxies/playertera.ts";
import { mdiskProxy } from "./api-proxies/mdisk.ts";
import { rapidapiProxy } from "./api-proxies/rapidapi.ts";
import { teraDownloaderCcProxy } from "./api-proxies/tera-downloader-cc.ts";
import { teradwnProxy } from "./api-proxies/teradwn.ts";

// MultiScraper integration
import fetch from "node-fetch";

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;


async function scrapeMetadata(mediaItemId: string, storage: IStorage) {
  const mediaItem = await storage.getMediaItem(mediaItemId);
  if (!mediaItem) return;

  console.log(`Scraping metadata for: ${mediaItem.url}`);
  const result = await getSingleFileInfo(mediaItem.url);

  if (result) {
    console.log('Scrape result:', result);

    if (result.title) {
      const updates: Partial<InsertMediaItem> = {
        title: result.title,
        description: result.description || mediaItem.description,
        thumbnail: result.thumbnail || mediaItem.thumbnail,
        size: result.size_bytes,
        type: result.type,
        error: null,
        scrapedAt: new Date(),
      };
      console.log('Updating media item with new metadata:', updates);
      await storage.updateMediaItem(mediaItemId, updates);
    } else {
      const updates = {
        error: result.error || "Scraping failed to find a title.",
        scrapedAt: new Date(),
      };
      console.log('Updating media item with scrape error:', updates);
      await storage.updateMediaItem(mediaItemId, updates);
    }
  } else {
    const updates = {
      error: "Failed to scrape metadata (no result returned).",
      scrapedAt: new Date(),
    };
    console.log('Updating media item with general scrape failure:', updates);
    await storage.updateMediaItem(mediaItemId, updates);
  }
}

export function registerRoutes(app: Express, storage: IStorage): Server {

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    console.log('Health check requested');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.get('/api/categories', async (req: Request, res: Response) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories || []);
    } catch (error) {
      console.error("Get categories error:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get('/api/media/pages', async (req: Request, res: Response) => {
    try {
      const { search, tags, categories, type, sizeRange, page = "1", limit = "20" } = req.query;

      const params: MediaSearchParams = {
        search: search as string,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        categories: categories ? (Array.isArray(categories) ? categories as string[] : [categories as string]) : undefined,
        type: type as "video" | "folder",
        sizeRange: sizeRange as "small" | "medium" | "large",
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      };

      const result = await storage.getMediaItems(params);

      // Check for missing metadata and trigger background fetching for current page items
      const itemsNeedingMetadata = result.items.filter(item =>
        !item.title || item.title === "Processing..." ||
        !item.thumbnail || !item.scrapedAt
      );

      // Trigger background metadata fetching for items missing data
      if (itemsNeedingMetadata.length > 0) {
        Promise.all(
          itemsNeedingMetadata.map(item => scrapeMetadata(item.id, storage))
        ).catch(error => {
          console.error("Background metadata fetching failed:", error);
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error in GET /api/media/pages:", error);
      res.status(500).json({ error: "Failed to fetch media items" });
    }
  });

  app.get('/api/api-options', async (req: Request, res: Response) => {
    try {
      const options = await storage.getApiOptions();
      res.json(options);
    } catch (error) {
      console.error("Get API options error:", error);
      res.status(500).json({ error: "Failed to fetch API options" });
    }
  });

  app.get('/api/teraboxfast', teraboxFastProxy);

  app.post('/api/iteraplay-proxy', iteraplayProxy);

  app.post('/api/playertera-proxy', playerteraProxy);

  app.get('/api/mdisk-proxy', mdiskProxy);

  app.post('/api/rapidapi', rapidapiProxy);

  app.post('/api/tera-downloader-cc', teraDownloaderCcProxy);

  app.post('/api/teradownloadr', teradwnProxy);


  // Media Items Routes
  app.get("/api/media", async (req: Request, res: Response) => {
    try {
      const { search, tags, type, sizeRange, page = "1", limit = "20" } = req.query;

      const params: MediaSearchParams = {
        search: search as string,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        type: type as "video" | "folder",
        sizeRange: sizeRange as "small" | "medium" | "large",
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      };

      const result = await storage.getMediaItems(params);

      // Check for missing metadata and trigger background fetching for current page items
      const itemsNeedingMetadata = result.items.filter(item =>
        !item.title || item.title === "Processing..." ||
        !item.thumbnail || !item.scrapedAt
      );

      // Trigger background metadata fetching for items missing data
      if (itemsNeedingMetadata.length > 0) {
        Promise.all(
          itemsNeedingMetadata.map(item => scrapeMetadata(item.id, storage))
        ).catch(error => {
          console.error("Background metadata fetching failed:", error);
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error in GET /api/media:", error);
      res.status(500).json({ error: "Failed to fetch media items" });
    }
  });

  app.get("/api/media/:id", async (req: Request, res: Response) => {
    try {
      const mediaItem = await storage.getMediaItem(req.params.id);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      res.json(mediaItem);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch media item" });
    }
  });

  app.post("/api/media", async (req: Request, res: Response) => {
    try {
      const { urls } = z.object({ urls: z.array(z.string().url()) }).parse(req.body);
      const createdItems = [];

      for (const url of urls) {
      // Always create a new item, allowing duplicates
      const mediaItem = await storage.createMediaItem({
        url,
        title: "Processing...",
        description: null,
        thumbnail: null
      });
        createdItems.push(mediaItem);
      }

      res.status(201).json(createdItems);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating media items:", error);
      res.status(500).json({ error: "Failed to create media items" });
    }
  });

  app.put("/api/media/:id", async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      const mediaItem = await storage.updateMediaItem(req.params.id, updates);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      res.json(mediaItem);
    } catch (error) {
      res.status(500).json({ error: "Failed to update media item" });
    }
  });

  app.delete("/api/media/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteMediaItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Media item not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete media item" });
    }
  });

  app.post("/api/media/:id/metadata", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await scrapeMetadata(id, storage);
      const mediaItem = await storage.getMediaItem(id);
      res.json({ success: true, mediaItem, action: "metadata_fetched" });
    } catch (error) {
      console.error("Error fetching metadata:", error);
      res.status(500).json({ error: "Failed to fetch metadata" });
    }
  });

  app.post("/api/media/:id/refresh", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await scrapeMetadata(id, storage);
      const mediaItem = await storage.getMediaItem(id);
      res.json({ success: true, mediaItem, action: "metadata_refreshed" });
    } catch (error) {
      console.error("Error refreshing metadata:", error);
      res.status(500).json({ error: "Failed to refresh metadata" });
    }
  });

  app.post("/api/media/:id/download", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { apiId } = req.body;

      if (!apiId) {
        return res.status(400).json({ error: "apiId is required" });
      }

      const mediaItem = await storage.getMediaItem(id);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }

      const apiOption = await storage.getApiOptionByName(apiId);
      if (!apiOption) {
        return res.status(404).json({ error: `API option '${apiId}' not found` });
      }

      const proxyUrl = `${BASE_URL}${apiOption.url}`;

      const proxyRes = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: mediaItem.url }),
      });

      if (!proxyRes.ok) {
        const errorText = await proxyRes.text();
        throw new Error(`Proxy request failed with status ${proxyRes.status}: ${errorText}`);
      }

      const proxyData = await proxyRes.json();
      const downloadUrl = proxyData.downloadUrl || proxyData.url || (proxyData.data && proxyData.data.url);

      if (!downloadUrl) {
        return res.status(500).json({ error: "Failed to extract download URL from proxy response", data: proxyData });
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expires in 24 hours

      await storage.updateMediaItem(id, {
        downloadUrl: downloadUrl,
        downloadExpiresAt: expiresAt,
        downloadFetchedAt: new Date(),
      });

      res.json({
        source: apiId,
        downloadUrl: downloadUrl,
        expiresAt: expiresAt.toISOString(),
      });

    } catch (error) {
      console.error("Error getting download URL:", error);
      res.status(500).json({ error: "Failed to get download URL" });
    }
  });

  app.get("/api/media/duplicates", async (req: Request, res: Response) => {
    try {
      const duplicates = await storage.getDuplicateMediaItems();
      res.json(duplicates);
    } catch (error) {
      console.error("Error getting duplicate media items:", error);
      res.status(500).json({ error: "Failed to fetch duplicate media items" });
    }
  });

  app.get("/api/media/duplicates/count", async (req: Request, res: Response) => {
    try {
      const duplicates = await storage.getDuplicateMediaItems();
      const count = Object.keys(duplicates).length;
      res.json({ count });
    } catch (error) {
      console.error("Error getting duplicate count:", error);
      res.status(500).json({ error: "Failed to fetch duplicate count" });
    }
  });


  // Tags Routes
  app.get("/api/tags", async (req: Request, res: Response) => {
    try {
      const tags = await storage.getTags();
      res.json(tags || []);
    } catch (error) {
      console.error("Get tags error:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.post("/api/tags", async (req: Request, res: Response) => {
    try {
      const validatedData = insertTagSchema.parse(req.body);
      // Check if tag with the same name already exists
      const existingTag = await storage.getTagByName(validatedData.name);
      if (existingTag) {
        return res.status(409).json({ error: `Tag "${validatedData.name}" already exists.` });
      }
      const tag = await storage.createTag(validatedData);
      res.status(201).json(tag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating tag:", error);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });

  app.delete("/api/tags/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteTag(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Tag not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  // Media Item Tags Routes
  app.post("/api/media/:mediaId/tags/:tagId", async (req: Request, res: Response) => {
    try {
      const { mediaId, tagId } = req.params;
      const result = await storage.addTagToMediaItem(mediaId, tagId);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to add tag to media item" });
    }
  });

  app.delete("/api/media/:mediaId/tags/:tagId", async (req: Request, res: Response) => {
    try {
      const { mediaId, tagId } = req.params;
      const success = await storage.removeTagFromMediaItem(mediaId, tagId);
      if (!success) {
        return res.status(404).json({ error: "Tag association not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove tag from media item" });
    }
  });

  // Categories Routes
  app.post("/api/categories", async (req: Request, res: Response) => {
    try {
      const validatedData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.delete("/api/categories/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // Media Item Categories Routes
  app.post("/api/media/:mediaId/categories/:categoryId", async (req: Request, res: Response) => {
    try {
      const { mediaId, categoryId } = req.params;
      const result = await storage.addCategoryToMediaItem(mediaId, categoryId);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to add category to media item" });
    }
  });

  app.delete("/api/media/:mediaId/categories/:categoryId", async (req: Request, res: Response) => {
    try {
      const { mediaId, categoryId } = req.params;
      const success = await storage.removeCategoryFromMediaItem(mediaId, categoryId);
      if (!success) {
        return res.status(404).json({ error: "Category association not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove category from media item" });
    }
  });

  // API Options Routes
  app.post("/api/api-options", async (req: Request, res: Response) => {
    try {
      const apiOption = await storage.createApiOption(req.body);
      res.status(201).json(apiOption);
    } catch (error) {
      console.error("Error creating API option:", error);
      res.status(500).json({ error: "Failed to create API option" });
    }
  });

  app.put("/api/api-options/:id", async (req: Request, res: Response) => {
    try {
      const apiOption = await storage.updateApiOption(req.params.id, req.body);
      if (!apiOption) {
        return res.status(404).json({ error: "API option not found" });
      }
      res.json(apiOption);
    } catch (error) {
      console.error("Error updating API option:", error);
      res.status(500).json({ error: "Failed to update API option" });
    }
  });

  app.delete("/api/api-options/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteApiOption(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "API option not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting API option:", error);
      res.status(500).json({ error: "Failed to delete API option" });
    }
  });

  const httpServer = createServer(app);
  // WebSocket setup
  // const wss = new WebSocketServer({ server: httpServer });

  // wss.on('connection', (ws) => {
  //   console.log('WebSocket client connected');

  //   ws.on('message', (message) => {
  //     console.log('Received:', message.toString());
  //   });

  //   ws.on('close', () => {
  //     console.log('WebSocket client disconnected');
  //   });
  // });

  

  return httpServer;
}