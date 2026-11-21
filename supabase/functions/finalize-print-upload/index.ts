import { handleFinalizePrintUpload } from '../_shared/handlers.ts';
import { serveEdgeFunction } from '../_shared/serveEdge.ts';

serveEdgeFunction(handleFinalizePrintUpload);
