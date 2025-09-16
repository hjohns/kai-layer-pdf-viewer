export default defineAppConfig({
    // nav menu, name substitutions, breadcrumbs prepend & pagination config goes here
    menu: ()=> [],
});

declare module '@nuxt/schema' {
    interface AppConfigInput {
        menu?: Array<{ label: string, url: string, active?: boolean }> | (() => Array<{ label: string, url: string, active?: boolean }>),
        nameSubstitutions?: Record<string, string>,
        breadcrumbPrepend?: Array<{ label: string, url: string }>,
        utilsMenu?: Array<{ label: string, url: string }>
    }
}
