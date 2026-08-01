/**
 * Punto de entrada ÚNICO a `recharts`.
 *
 * POR QUÉ EXISTE
 * --------------
 * `recharts` pesa alrededor de 200 KB comprimido y se importaba de forma estática
 * en `/admin` y en `/admin/analytics/bias`. Un import estático entra en el bundle
 * de la primera carga de esa ruta, así que el panel descargaba y evaluaba la
 * librería de gráficas ANTES de pintar cualquier cosa, incluidas las tarjetas de
 * métricas que no son gráficas.
 *
 * Concentrando aquí la reexportación, los dos consumidores cargan el módulo con
 * `next/dynamic`, que lo mueve a un fragmento aparte pedido bajo demanda.
 *
 * POR QUÉ UN BARRIL Y NO `dynamic()` POR GRÁFICA
 * ----------------------------------------------
 * `recharts` es un árbol de componentes que se comunican por contexto:
 * `<ResponsiveContainer>` mide, `<LineChart>` provee la escala y `<Line>`,
 * `<XAxis>` y `<Tooltip>` la consumen. Cargar cada pieza por separado con
 * `dynamic()` las montaría en momentos distintos y rompería ese contexto. Lo que se
 * carga en diferido es el COMPONENTE DE GRÁFICA completo del consumidor, y este
 * barril es simplemente el sitio donde `recharts` se toca una sola vez.
 */
export {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
