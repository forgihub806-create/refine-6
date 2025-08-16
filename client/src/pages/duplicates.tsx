import { useQuery } from "@tanstack/react-query";
import { getDuplicateMediaItems } from "@/lib/api";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function DuplicatesPage() {
  const { data: duplicates, isLoading, error } = useQuery({
    queryKey: ['duplicates'],
    queryFn: getDuplicateMediaItems,
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Library
            </Link>
          </Button>
        </div>

        <h1 className="text-3xl font-bold mb-2">Duplicate Media Items</h1>
        <p className="text-slate-400 mb-8">
          Showing groups of items that share the same URL.
        </p>

        {isLoading && <p>Loading duplicates...</p>}
        {error && <p className="text-red-400">Error fetching duplicates: {error.message}</p>}

        {duplicates && Object.keys(duplicates).length === 0 && (
          <div className="text-center py-12 border border-dashed border-slate-700 rounded-lg">
            <h3 className="text-xl font-semibold">No Duplicates Found</h3>
            <p className="text-slate-400 mt-2">Your media library is clean!</p>
          </div>
        )}

        {duplicates && Object.keys(duplicates).length > 0 && (
          <div className="space-y-8">
            {Object.entries(duplicates).map(([url, items]) => (
              <div key={url} className="bg-surface p-6 rounded-lg border border-slate-700">
                <h2 className="font-mono text-sm text-primary mb-1 break-all">{url}</h2>
                <p className="text-slate-400 text-xs mb-4">
                  Found {items.length} items with this URL.
                </p>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-md">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          Added: {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {/* We would need a way to open the detail modal from here */}
                      {/* For now, we just show the info */}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
