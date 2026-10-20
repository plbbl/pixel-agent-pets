use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub struct Action { pub id: String, pub title: String }
#[derive(Clone, Debug, Deserialize)]
pub struct Character { pub id: String, pub title: String, pub actions: Vec<Action> }
#[derive(Clone, Debug, Deserialize)]
pub struct Catalog { pub characters: Vec<Character>, pub animations: usize }
impl Catalog {
    pub fn character(&self, id: &str) -> Option<&Character> { self.characters.iter().find(|c| c.id == id) }
    pub fn action(&self, character: &str, id: &str) -> bool { self.character(character).is_some_and(|c| c.actions.iter().any(|a| a.id == id)) }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences { pub character: String, pub size: u16, pub quality: String, pub visible: bool }
impl Default for Preferences {
    fn default() -> Self { Self { character: "claude".into(), size: 160, quality: "auto".into(), visible: true } }
}
impl Preferences {
    pub fn valid(&self, catalog: &Catalog) -> bool { catalog.character(&self.character).is_some() && [80,112,160,224,320].contains(&self.size) && ["auto","80","160","320"].contains(&self.quality.as_str()) }
}
#[derive(Clone, Debug, PartialEq)]
pub enum Selection { Character(String), Action(String), Showcase, Size(u16), Quality(String), Visibility, Quit }
pub fn selection(id: &str, prefs: &Preferences, catalog: &Catalog) -> Option<Selection> {
    if id == "showcase" { return Some(Selection::Showcase); }
    if id == "visible" { return Some(Selection::Visibility); }
    if id == "quit" { return Some(Selection::Quit); }
    let (kind, value) = id.split_once(':')?;
    match kind {
        "character" if catalog.character(value).is_some() => Some(Selection::Character(value.into())),
        "action" if catalog.action(&prefs.character, value) => Some(Selection::Action(value.into())),
        "size" => { let size=value.parse::<u16>().ok()?; ([80,112,160,224,320].contains(&size) && size.to_string()==value).then_some(Selection::Size(size)) },
        "quality" if ["auto","80","160","320"].contains(&value) => Some(Selection::Quality(value.into())),
        _ => None,
    }
}
#[derive(Clone,Debug,Serialize,Deserialize)]
pub struct DrawCheck { pub character:String, pub quality:String, pub resolution:u16, pub action:String, #[serde(rename="drawnPixels")] pub drawn_pixels:u32 }
pub fn smoke_checks(catalog:&Catalog,checks:&[DrawCheck])->bool {
    checks.len()==16 && checks.iter().all(|c| catalog.action(&c.character,&c.action) && c.drawn_pixels>0 && c.drawn_pixels<=2048*2048 && if c.character=="clawd" {c.resolution==80} else {match c.quality.as_str(){"auto"=>[80,160,320].contains(&c.resolution),"80"=>c.resolution==80,"160"=>c.resolution==160,"320"=>c.resolution==320,_=>false}}) && catalog.characters.iter().all(|character|["auto","80","160","320"].iter().all(|quality|checks.iter().any(|c|c.character==character.id && c.quality==*quality)))
}
pub fn actor_hit(x:f64,y:f64,width:f64,size:f64)->bool {
    x.is_finite() && y.is_finite() && x>=width/2.0-size*0.8 && x<=width/2.0+size*0.8 && y>=42.0 && y<=42.0+size
}
pub fn fit_origin(old_x:f64,old_y:f64,old_width:f64,old_baseline:f64,width:f64,baseline:f64) -> (f64,f64) {
    (old_x + old_width/2.0 - width/2.0, old_y + old_baseline - baseline)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn catalog() -> Catalog { serde_json::from_str(include_str!("../generated/catalog.json")).unwrap() }
    #[test] fn all_actions_are_native_menu_choices() {
        let c=catalog();assert_eq!(c.animations,66);assert_eq!(c.characters.len(),4);
        for character in &c.characters { let p=Preferences { character: character.id.clone(), ..Default::default() };for action in &character.actions { assert_eq!(selection(&format!("action:{}",action.id),&p,&c),Some(Selection::Action(action.id.clone()))); } }
    }
    #[test] fn forged_actions_and_invalid_preferences_fail_closed() {
        let c=catalog();let p=Preferences::default();
        for value in ["action:../../file","character:unknown","size:0160","size:0","quality:720","action:rice"] { assert_eq!(selection(value,&p,&c),None); }
        assert!(p.valid(&c));assert!(!Preferences { size:999,..p.clone() }.valid(&c));assert!(!Preferences { quality:"unlimited".into(),..p }.valid(&c));
    }
    #[test] fn smoke_requires_all_roles_and_quality_frames() {
        let c=catalog();let mut checks=Vec::new();for role in &c.characters {for quality in ["auto","80","160","320"] {checks.push(DrawCheck {character:role.id.clone(),quality:quality.into(),resolution:if role.id=="clawd" {80} else {quality.parse().unwrap_or(160)},action:role.actions[0].id.clone(),drawn_pixels:100});}}
        assert!(smoke_checks(&c,&checks));checks[0].drawn_pixels=0;assert!(!smoke_checks(&c,&checks));checks.remove(0);assert!(!smoke_checks(&c,&checks));
    }
    #[test] fn transparent_padding_does_not_capture_clicks() {
        assert!(actor_hit(128.0,100.0,256.0,80.0));assert!(!actor_hit(10.0,100.0,256.0,80.0));assert!(!actor_hit(128.0,20.0,256.0,80.0));assert!(!actor_hit(f64::NAN,100.0,256.0,80.0));
    }
    #[test] fn resize_keeps_actor_feet_fixed() {
        let (x,y)=fit_origin(400.0,500.0,272.0,176.0,528.0,310.0);assert_eq!(x+528.0/2.0,536.0);assert_eq!(y+310.0,676.0);
    }
}
