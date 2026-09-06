// `server-only` existe para que Next falle si un módulo de servidor termina en
// el bundle del navegador. En los tests no hay bundle, y sin este reemplazo el
// import corta la ejecución antes de llegar a la función que se quiere probar.
export {};
