// Контент карточек портфолио — общий источник для canvas-текстур в R3F
// (полёт) и HTML-сетки в финале сцены. Данные плейсхолдер, заменим на реальные.

export type CardContent = {
  title: string;
  description: string;
  tag: string;
};

export const CARDS_CONTENT: CardContent[] = [
  {
    title: "Промо-сайт студии",
    description: "Hero и пять сцен на скролле с жидкой метафорой пути.",
    tag: "Web",
  },
  {
    title: "Банковский клиент",
    description: "iOS- и Android-приложение для частных клиентов.",
    tag: "Mobile",
  },
  {
    title: "Brand system",
    description: "Айдентика и гайдлайны для tech-стартапа на ранней стадии.",
    tag: "Branding",
  },
  {
    title: "E-commerce платформа",
    description: "B2B-каталог с конструктором заказов и аналитикой продаж.",
    tag: "Platform",
  },
];
